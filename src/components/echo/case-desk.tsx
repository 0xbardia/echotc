import { Link, useNavigate } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { chainConfigured, CONTRACT_ADDRESS, DEPLOYMENT_TX } from "@/lib/echo/chain";
import { chainExecutionSucceeded, isChainCaseId, nextChainCall, type ChainSnapshot } from "@/lib/echo/chain-plan";
import { callView, plan, removalImpact, retryable, type ViewName } from "@/lib/echo/engine";
import { getIsolatedCase, useEcho } from "@/lib/echo/store";
import type { CaseFile, Relationship } from "@/lib/echo/types";
import {
  findInFlightOperation,
  prepareOperation,
  recordBroadcast,
  recordSuccess,
  recordTerminalRejection,
  recordTimeout,
  recordUserRejection,
  reconcileOperation,
  withCrossTabLock,
  type DurableOperation,
} from "@/lib/echo/operation-lock";
import { useLedgerReady } from "./use-ledger";

const readOnChain = createClientOnlyFn(async (method: string, args: string[]) => {
  const mod = await import("@/lib/echo/chain.client");
  return mod.readChain(method, args);
});

const submitOnChain = createClientOnlyFn(async (method: string, args: string[], account: `0x${string}`) => {
  const mod = await import("@/lib/echo/chain.client");
  const submitted = await mod.writeChain(method, args, account);
  const settled = await mod.waitChain(submitted.hash);
  return { ...submitted, ...settled, caseId: settled.tx ? mod.returnedCaseId(settled.tx) : null };
});

const lookupTxOnChain = createClientOnlyFn(async (hash: string) => {
  const { createClient } = await import("genlayer-js");
  const { studionet } = await import("genlayer-js/chains");
  const client = createClient({ chain: studionet });
  try {
    const tx = await client.getTransaction({ hash: hash as never });
    return tx as Record<string, unknown>;
  } catch {
    return null;
  }
});

const challengeOnChain = createClientOnlyFn(async (txId: `0x${string}`, account: `0x${string}` | null) => {
  const mod = await import("@/lib/echo/chain.client");
  return mod.challengeChain(txId, account);
});

const readRelationshipsOnChain = createClientOnlyFn(async (id: string) => {
  const mod = await import("@/lib/echo/chain.client");
  return mod.readRelationships(id);
});

const readSnapshot = createClientOnlyFn(async (caseId: string, sourceIds?: string[]) => {
  const mod = await import("@/lib/echo/chain.client");
  const caseRead = await mod.readChain("get_case", [caseId]);
  if (!caseRead.ok) throw new Error(caseRead.error);
  const parsed = typeof caseRead.value === "string" ? JSON.parse(caseRead.value) : caseRead.value;
  if (parsed && parsed.found === false) throw new Error("Studionet has no case with that id.");

  const ids =
    sourceIds && sourceIds.length > 0
      ? sourceIds
      : (parsed.manifest?.sources || []).map((s: { id: string }) => s.id);

  const [relResult, ...reviews] = await Promise.all([
    mod.readRelationships(caseId),
    ...ids.map((sourceId: string) => mod.readChain("get_source_review", [caseId, sourceId])),
  ]);

  const relationships = relResult.relationships;

  const parsedReviews = reviews.map((r) => {
    if (!r.ok) throw new Error(r.error);
    return typeof r.value === "string" ? JSON.parse(r.value) : r.value;
  });

  return {
    caseId,
    status: String(parsed.status),
    owner: String(parsed.owner),
    reviews: parsedReviews,
    relationships,
  } satisfies ChainSnapshot;
});

const VIEWS: ViewName[] = [
  "get_case",
  "get_source_review",
  "get_relationships",
  "get_report",
  "get_policy",
  "get_policy_version",
  "get_case_count",
];

const PUBLISHED_CASE = "et-41f3646a7e1f";

function statusLabel(file: CaseFile) {
  if (file.status !== "FINALIZED") return file.status.replaceAll("_", " ");
  return file.report?.complete ? "FINALIZED · complete report" : "FINALIZED · partial report";
}

export function CaseDesk({ id }: { id: string }) {
  const ready = useLedgerReady();
  const localFile = useEcho((state) => getIsolatedCase(state.ledger, id, CONTRACT_ADDRESS));
  const ledger = useEcho((state) => state.ledger);
  const principal = useEcho((state) => state.principal);
  const approveNext = useEcho((state) => state.approveNext);
  const denyNext = useEcho((state) => state.denyNext);
  const retry = useEcho((state) => state.retry);
  const recordChain = useEcho((state) => state.recordChain);
  const [tab, setTab] = useState<"graph" | "list" | "collapse">("list");
  const [hidden, setHidden] = useState<string[]>([]);
  const [view, setView] = useState<ViewName>("get_case");
  const [sourceId, setSourceId] = useState("src-1");
  const [publicCaseId, setPublicCaseId] = useState(PUBLISHED_CASE);
  const [readOut, setReadOut] = useState("");
  const [readMeta, setReadMeta] = useState("Not read yet.");
  const [challengeHash, setChallengeHash] = useState("");
  const [challengeNote, setChallengeNote] = useState("");
  const [chainNote, setChainNote] = useState("");
  const [chainBusy, setChainBusy] = useState(false);
  const [activeOp, setActiveOp] = useState<DurableOperation | null>(null);
  const [error, setError] = useState("");
  const [mirror, setMirror] = useState<{ snapshot: ChainSnapshot | null; report: string | null; reportError: string | null } | null>(null);
  const navigate = useNavigate();
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteCase, setRemoteCase] = useState<CaseFile | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteNotFound, setRemoteNotFound] = useState(false);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorRefreshIndex, setMirrorRefreshIndex] = useState(0);

  useEffect(() => {
    if (localFile || !ready) return;
    let cancel = false;
    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteNotFound(false);
    void (async () => {
      try {
        const caseRead = await readOnChain("get_case", [id]);
        if (cancel) return;
        if (!caseRead.ok) {
          setRemoteError(caseRead.error);
          return;
        }
        const parsed = typeof caseRead.value === "string" ? JSON.parse(caseRead.value) : caseRead.value;
        if (!parsed || parsed.found === false) {
          setRemoteNotFound(true);
          return;
        }
        const [rep, relResult] = await Promise.all([
          readOnChain("get_report", [id]),
          readRelationshipsOnChain(id),
        ]);
        if (cancel) return;
        const reportParsed = rep?.ok ? (typeof rep.value === "string" ? JSON.parse(rep.value) : rep.value) : null;
        const rawRelationships = relResult?.relationships || [];

        const sources = (parsed.manifest?.sources || []).map((s: { id: string; url: string; role?: string; parentSourceId?: string | null }) => {
          let host = s.id;
          try {
            if (s.url) host = new URL(s.url).hostname;
          } catch {
            host = s.id;
          }
          return {
            ...s,
            title: host,
            role: (s.role === "discovered" ? "discovered" : "submitted") as "discovered" | "submitted",
            parentSourceId: s.parentSourceId || null,
          };
        });

        const constructed: CaseFile = {
          id: parsed.id,
          owner: parsed.owner,
          status: parsed.status,
          manifest: {
            claim: parsed.manifest?.claim || "",
            language: parsed.manifest?.language || "en",
            sources,
            policyVersion: parsed.manifest?.policyVersion || "echotrace-policy-1.0.0",
            clientRequestId: parsed.manifest?.clientRequestId || "",
            parentCaseId: parsed.manifest?.parentCaseId || null,
            manifestCanonical: "",
          },
          reviews: sources.map((s: { id: string }) => ({
            sourceId: s.id,
            fetchStatus: "reviewed",
            stance: "mentions_only",
            contributions: [],
            attempts: 1,
            coverageNote: "Studionet verified",
            limitations: "",
          })),
          relationships: rawRelationships,
          report: reportParsed?.finalized ? reportParsed : null,
          receipts: [],
          appliedBatches: [],
          chain: {
            caseId: parsed.id,
            owner: parsed.owner,
            contractAddress: CONTRACT_ADDRESS,
            txs: [],
          },
          createdAt: parsed.createdAt || "on-chain",
          updatedAt: parsed.updatedAt || "on-chain",
        };
        if (!cancel) setRemoteCase(constructed);
      } catch (err) {
        if (!cancel) setRemoteError(err instanceof Error ? err.message : "Failed to load on-chain case");
      } finally {
        if (!cancel) setRemoteLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [localFile, id, ready]);

  const activeFile = localFile || remoteCase;
  const step = activeFile ? plan(activeFile) : null;
  const impact = activeFile ? removalImpact(activeFile, hidden) : null;
  
  const rawOnChainOwner = mirror?.snapshot?.owner || activeFile?.chain?.owner || activeFile?.owner || "";
  const isOwner = Boolean(
    principal.startsWith("0x") &&
      rawOnChainOwner &&
      principal.toLowerCase() === rawOnChainOwner.toLowerCase()
  );
  const owned = isOwner;

  const isWrongContract = Boolean(
    activeFile?.chain?.contractAddress &&
      activeFile.chain.contractAddress.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()
  );

  const chainCaseId = activeFile?.chain?.caseId ?? (isChainCaseId(id) ? id : "");
  const chainFinal = Boolean(
    activeFile?.chain?.txs.some((tx: { method: string; execution: string }) => tx.method === "finalize_case" && chainExecutionSucceeded(tx.execution)) ||
      mirror?.snapshot?.status === "FINALIZED" || activeFile?.status === "FINALIZED",
  );
  const upcoming =
    !activeFile || chainFinal
      ? null
      : !chainCaseId
        ? nextChainCall(activeFile, null, "preview")
        : mirror?.snapshot
          ? nextChainCall(activeFile, mirror.snapshot, "preview")
          : null;
  const readyToSign = Boolean(!chainCaseId || (mirror?.snapshot && !mirror?.reportError));

  const canSign = Boolean(
    isOwner &&
      !isWrongContract &&
      !chainBusy &&
      !activeOp &&
      !mirrorLoading &&
      !chainFinal &&
      chainConfigured() &&
      principal.startsWith("0x") &&
      readyToSign &&
      upcoming &&
      !mirror?.reportError
  );

  useEffect(() => {
    if (!chainCaseId || !activeFile) return;
    let cancel = false;
    setMirrorLoading(true);
    const sourceIds = activeFile.manifest.sources.map((source: { id: string }) => source.id);
    void (async () => {
      try {
        const [snapshot, report] = await Promise.all([
          readSnapshot(chainCaseId, sourceIds),
          readOnChain("get_report", [chainCaseId]),
        ]);
        if (cancel) return;
        setMirror({
          snapshot,
          report: report?.ok ? (typeof report.value === "string" ? report.value : JSON.stringify(report.value)) : null,
          reportError: report && !report.ok ? report.error : null,
        });
      } catch (reason) {
        if (!cancel) {
          setMirror({ snapshot: null, report: null, reportError: reason instanceof Error ? reason.message : "Studionet read failed." });
        }
      } finally {
        if (!cancel) setMirrorLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [chainCaseId, activeFile, mirrorRefreshIndex]);

  useEffect(() => {
    if (!principal.startsWith("0x")) {
      setActiveOp(null);
      return;
    }
    const targetCaseId = chainCaseId || (activeFile ? activeFile.id : id);
    const existing = findInFlightOperation(61999, CONTRACT_ADDRESS, principal, targetCaseId);
    setActiveOp(existing);

    if (
      existing &&
      existing.hash &&
      (existing.status === "BROADCASTED" || existing.status === "ACCEPTED" || existing.status === "TIMEOUT")
    ) {
      let cancel = false;
      void (async () => {
        try {
          const { changed } = await reconcileOperation(existing, async (h) => {
            return await lookupTxOnChain(h);
          });
          if (cancel) return;
          if (changed) {
            setActiveOp(findInFlightOperation(61999, CONTRACT_ADDRESS, principal, targetCaseId));
            setMirrorRefreshIndex((n) => n + 1);
          }
        } catch {
          // ignore lookup errors
        }
      })();
      return () => {
        cancel = true;
      };
    }
  }, [principal, chainCaseId, activeFile, id, mirrorRefreshIndex]);

  const families = activeFile?.report?.families ?? [];
  const sourceTitle = useMemo(() => {
    const map = new Map<string, string>();
    activeFile?.manifest.sources.forEach((source: { id: string; title: string }) => map.set(source.id, source.title));
    return map;
  }, [activeFile]);

  if (!ready || remoteLoading) return <div className="wrap"><div className="skeleton" role="status" aria-label="Opening ledger or reading contract…" /></div>;
  if (remoteError && !remoteError.includes("No contract address is configured")) {
    return (
      <div className="wrap">
        <h1>Studionet read error</h1>
        <p className="error" role="alert">{remoteError}</p>
        <p className="muted">Direct Mode keeps local cases. For on-chain cases, verify network connection to Studionet.</p>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Retry</button>
          <Link className="btn" to="/app">Back to the desk</Link>
        </div>
      </div>
    );
  }
  if (remoteNotFound) {
    return (
      <div className="wrap">
        <h1>Case not on this device</h1>
        <p>No case with id {id} exists in this browser or at contract {CONTRACT_ADDRESS}.</p>
        <Link className="btn" to="/app">Back to the desk</Link>
      </div>
    );
  }
  if (!activeFile) {
    return (
      <div className="wrap">
        <h1>Case not on this device</h1>
        <p>Direct Mode keeps cases in this browser. There is no index entry for {id}.</p>
        <Link className="btn" to="/app">Back to the desk</Link>
      </div>
    );
  }

  const file = activeFile;

  function onApprove() {
    const result = approveNext(file.id, new Date().toISOString());
    setError(result.ok ? "" : result.error);
  }

  async function onChain() {
    if (!principal.startsWith("0x")) return;
    if (chainBusy || activeOp) return;
    if (file.chain?.contractAddress && file.chain.contractAddress.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
      setChainNote(`This case belongs to contract ${file.chain.contractAddress}, not currently configured ${CONTRACT_ADDRESS}. Nothing was sent.`);
      return;
    }
    if (file.chain?.txs?.length && !file.chain?.contractAddress) {
      setChainNote(`This legacy case has chain history without a recorded contract address. It cannot trigger writes against new deployment ${CONTRACT_ADDRESS}.`);
      return;
    }
    if (!isOwner) {
      setChainNote("This Studionet case is owned by a different account. Nothing was sent.");
      return;
    }

    const targetCaseId = chainCaseId || file.id;

    try {
      await withCrossTabLock(`echotc-case-${targetCaseId}`, async () => {
        const existingInFlight = findInFlightOperation(61999, CONTRACT_ADDRESS, principal, targetCaseId);
        if (existingInFlight) {
          setActiveOp(existingInFlight);
          setChainNote(`Transaction ${existingInFlight.hash || existingInFlight.logicalOp} is already in flight. Duplicate submission prevented.`);
          return;
        }

        setChainBusy(true);
        setChainNote("Preparing the next contract call from the current Studionet read.");

        let snapshot: ChainSnapshot | null = mirror?.snapshot || null;
        if (file.chain?.caseId && !snapshot) {
          const sourceIds = file.manifest.sources.map((source) => source.id);
          snapshot = await readSnapshot(file.chain.caseId, sourceIds);
        }

        const freshBatchId = `b-${Date.now().toString(36)}`;
        const call = nextChainCall(file, snapshot, freshBatchId);
        if (!call) {
          setChainNote("No further Studionet write is waiting. The chain case is finalized or unreadable as an open case.");
          setChainBusy(false);
          return;
        }

        const batchId =
          call.method === "review_sources_batch" || call.method === "review_relationship_batch"
            ? call.args[1] || freshBatchId
            : null;

        const { op: durableOp } = prepareOperation({
          chainId: 61999,
          contractAddress: CONTRACT_ADDRESS,
          account: principal,
          caseId: targetCaseId,
          method: call.method,
          args: call.args,
          batchId,
        });
        setActiveOp(durableOp);

        setChainNote(`Wallet prompt for ${call.method}. Consensus has not finished.`);
        let submitted;
        try {
          submitted = await submitOnChain(call.method, call.args, principal as `0x${string}`);
        } catch (err) {
          recordUserRejection(durableOp.key, err instanceof Error ? err.message : "User rejected transaction.");
          setActiveOp(null);
          throw err;
        }

        if (!submitted) {
          recordUserRejection(durableOp.key, "Wallet submission returned empty.");
          setActiveOp(null);
          throw new Error("Wallet submission is only available in the browser.");
        }

        recordBroadcast(durableOp.key, submitted.hash);

        if (submitted.statusName === "TIMEOUT" || (!submitted.ok && submitted.error?.includes("Timed out"))) {
          recordTimeout(durableOp.key);
          setActiveOp(findInFlightOperation(61999, CONTRACT_ADDRESS, principal, targetCaseId));
        } else if (submitted.ok) {
          recordSuccess(durableOp.key, { statusName: submitted.statusName, execution: submitted.execution });
          setActiveOp(null);
        } else {
          recordTerminalRejection(durableOp.key, {
            statusName: submitted.statusName,
            execution: submitted.execution,
            error: submitted.error,
          });
          setActiveOp(null);
        }

        const resolvedCaseId = submitted.caseId || snapshot?.caseId || file.chain?.caseId || null;
        let owner = snapshot?.owner || file.chain?.owner || null;
        if (submitted.ok && resolvedCaseId) {
          try {
            const confirmed = await readSnapshot(resolvedCaseId, file.manifest.sources.map((source) => source.id));
            const confirmedReport = await readOnChain("get_report", [resolvedCaseId]);
            owner = confirmed.owner;
            setMirror({
              snapshot: confirmed,
              report: confirmedReport?.ok
                ? typeof confirmedReport.value === "string"
                  ? confirmedReport.value
                  : JSON.stringify(confirmedReport.value)
                : null,
              reportError: confirmedReport && !confirmedReport.ok ? confirmedReport.error : null,
            });
          } catch (reason) {
            owner = owner || null;
            setError(reason instanceof Error ? reason.message : "The transaction finalized, but the follow-up read failed.");
          }
        }

        recordChain(
          file.id,
          {
            method: call.method,
            hash: submitted.hash,
            statusName: submitted.statusName,
            execution: submitted.execution,
            at: new Date().toISOString(),
            detail: submitted.ok ? `${call.method} finalized with ${submitted.execution}.` : submitted.error,
          },
          resolvedCaseId,
          owner,
          CONTRACT_ADDRESS,
          file,
        );

        if (submitted.ok && resolvedCaseId && file.id !== resolvedCaseId) {
          void navigate({ to: "/cases/$id", params: { id: resolvedCaseId } });
        }
        setChainNote(
          submitted.ok
            ? `${call.method} ${submitted.hash} finalized ${submitted.statusName} / ${submitted.execution}. Chain case ${resolvedCaseId || "not returned"}.`
            : `${call.method} ${submitted.hash} did not succeed. ${submitted.error}`,
        );
      });
    } catch (reason) {
      setChainNote(reason instanceof Error ? reason.message : "Chain write failed before submission.");
    } finally {
      setChainBusy(false);
    }
  }

  async function onChallenge() {
    const txId = (challengeHash.trim() || file.chain?.txs.at(-1)?.hash || "") as `0x${string}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txId)) {
      setChallengeNote("Paste the transaction hash first. Nothing was sent.");
      return;
    }
    setChallengeNote("Checking whether Studionet can take an appeal…");
    const account = principal.startsWith("0x") ? (principal as `0x${string}`) : null;
    const result = await challengeOnChain(txId, account);
    setChallengeNote(result.ok ? `Appeal submitted for ${result.txId}.` : result.error);
  }

  function runLocalRead() {
    const result = callView(ledger, view, { caseId: file.id, sourceId });
    const at = new Date().toISOString();
    setReadMeta(`Direct Mode ledger · ${at}. This is not a chain read.`);
    setReadOut(JSON.stringify(result, null, 2));
  }

  async function runChainRead() {
    const selected = (document.querySelector("[data-testid='read-method']") as HTMLSelectElement | null)?.value as ViewName | undefined;
    const method = selected || view;
    const chainCase = file.chain?.caseId || publicCaseId.trim();
    const args =
      method === "get_source_review"
        ? [chainCase, sourceId]
        : method.startsWith("get_p") || method === "get_case_count"
          ? []
          : [chainCase];
    if (!args.every(Boolean) && method !== "get_policy" && method !== "get_policy_version" && method !== "get_case_count") {
      setReadMeta("This case has no Studionet id yet. A local id was not sent.");
      setReadOut("");
      return;
    }
    setReadOut("");
    setReadMeta("Reading Studionet…");
    try {
      const result = await readOnChain(method, args);
      if (!result) {
        setReadMeta("Chain read did not run.");
        setReadOut("");
        return;
      }
      setReadMeta(result.ok ? `Studionet read · ${result.readAt} · ${result.address}` : "Chain read was not completed.");
      setReadOut(JSON.stringify(result, null, 2));
    } catch (error) {
      setReadMeta("Studionet read failed. This is not a Direct Mode result.");
      setReadOut(error instanceof Error ? error.message : "Read failed.");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ mode: "direct", exportedAt: new Date().toISOString(), case: file }, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${file.id}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function share() {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setChainNote("Link copied. It opens this case in this browser’s Direct Mode ledger. It is not a hosted public record.");
  }

  return (
    <div className="wrap">
      <p className="kicker">Case {file.id}</p>
      <h1 data-testid="case-status">{statusLabel(file)}</h1>
      <p className="lede">{file.manifest.claim}</p>
      <p className="muted url">/cases/{file.id} · this address keeps the case after a refresh</p>
      <p className="muted">Policy {file.manifest.policyVersion} · owner {file.owner}</p>
      {file.report && !file.report.complete ? (
        <div className="banner banner-warn" data-testid="partial-banner">
          <strong>Direct Mode is partial.</strong>
          <p>At least one local source is unavailable, failed, or an origin is unreviewed. That is not a finding that the claim is false, and it is not the Studionet report.</p>
        </div>
      ) : null}
      {file.report?.complete ? (
        <div className="banner banner-ok">
          <strong>Direct Mode report is complete.</strong>
          <p>Every local source was reviewed and no origin gap remains. This ledger is still not Studionet consensus.</p>
        </div>
      ) : null}
      {!owned ? (
        <div className="banner banner-warn">Reads are public. Writes are refused because this principal does not own the case.</div>
      ) : null}

      {step && owned ? (
        <section className="glass card section" aria-label="Action queue">
          <p className="kicker">Next approval</p>
          <h2>{step.title}</h2>
          <p>{step.explain}</p>
          <p className="muted">About {step.remaining} approval{step.remaining === 1 ? "" : "s"} remain in this Direct Mode plan, including this one. A retry is extra. This is not a fee quote. Chain fee: unavailable while writes are in Direct Mode.</p>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="row">
            <button className="btn btn-primary" type="button" data-testid="approve" onClick={onApprove}>Approve in Direct Mode</button>
            <button className="btn btn-deny" type="button" data-testid="deny" onClick={() => denyNext(file.id, step.method, new Date().toISOString())}>
              Deny
            </button>
          </div>
          <p className="muted">Direct Mode stays in this browser. The Studionet button below is the only control that asks the wallet to sign.</p>
          {retryable(file) ? (
            <div className="row">
              <button className="btn" type="button" onClick={() => {
                const result = retry(file.id, new Date().toISOString());
                setError(result.ok ? "" : result.error);
              }}>
                Retry unavailable sources
              </button>
              <span className="muted">Optional. Attempt cap is 2. Unavailable can stay unavailable.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="glass card section" aria-label="Studionet submission" data-testid="chain-panel">
        <p className="kicker">Studionet</p>
        <h2>{upcoming?.title ?? (chainFinal ? "Nothing left to sign" : "Submit with the connected wallet")}</h2>
        <p>{upcoming?.explain ?? "Each signature is one contract method. Direct Mode approval does not sign this."}</p>
        <p className="muted url">Contract {CONTRACT_ADDRESS}. Deployment {DEPLOYMENT_TX}. A Studionet review stores an anchored sentence. It does not invent an origin URL.</p>
        <p data-testid="chain-case-id">
          {file.chain?.caseId
            ? `Chain case ${file.chain.caseId}. Owner ${mirror?.snapshot?.owner || file.chain.owner || "unread"}. Status ${mirror?.snapshot?.status || "loading"}.`
            : "No Studionet case yet. The first signature creates one from this manifest."}
        </p>
        {!isOwner ? (
          <div className="banner banner-warn" role="status">
            <p>Read-only: This case is owned on Studionet by {rawOnChainOwner || file.owner}. You can inspect evidence and view contract reports, but only the owner can submit subsequent transactions.</p>
          </div>
        ) : null}
        {isWrongContract ? (
          <div className="banner banner-warn" role="status">
            <p>Wrong contract: This case belongs to contract {file.chain?.contractAddress}, not currently configured {CONTRACT_ADDRESS}. Submissions are refused.</p>
          </div>
        ) : null}
        <div className="row">
          <button
            className="btn btn-primary"
            type="button"
            data-testid="submit-wallet"
            disabled={!canSign}
            onClick={() => void onChain()}
          >
            {activeOp
              ? activeOp.status === "TIMEOUT"
                ? "Transaction pending on chain (waiter timed out)"
                : `In flight: ${activeOp.logicalOp} (${activeOp.statusName || "submitted"})`
              : mirrorLoading
                ? "Refreshing chain state…"
                : chainBusy
                  ? "Waiting for consensus…"
                  : chainFinal
                    ? "Finalized on Studionet"
                    : isWrongContract
                      ? "Wrong contract deployment"
                      : !isOwner
                        ? "Read-only: Connected account is not the owner"
                        : mirror?.reportError
                          ? "Studionet read failed"
                          : "Sign this step"}
          </button>
        </div>
        {!principal.startsWith("0x") ? <p className="muted">Connect a Studionet account first. Nothing is sent from the preview principal.</p> : null}
        {chainNote ? <p className="banner" role="status" data-testid="chain-note">{chainNote}</p> : null}
        <div className="section">
          <p className="kicker">Challenge</p>
          <p className="muted">An appeal asks validators to reopen one transaction. It is not a case write, and it is not sent if this network has no appeals contract.</p>
          <input
            className="field"
            data-testid="challenge-hash"
            value={challengeHash}
            placeholder="0x transaction hash"
            onChange={(event) => setChallengeHash(event.target.value)}
          />
          <button className="btn" type="button" data-testid="challenge" onClick={() => void onChallenge()}>
            Challenge this transaction
          </button>
          {challengeNote ? <p className="banner" role="status" data-testid="challenge-note">{challengeNote}</p> : null}
        </div>
        {file.chain?.txs.length ? (
          <ul className="list">
            {file.chain.txs.map((tx) => (
              <li key={tx.hash} className="url">
                {tx.method} · {tx.statusName} · {tx.execution} · {tx.hash}
              </li>
            ))}
          </ul>
        ) : null}
        {mirror?.report ? (
          <div className="banner banner-ok" data-testid="chain-report">
            <strong>Studionet report. Not the Direct Mode ledger.</strong>
            <p className="url">{mirror.report}</p>
          </div>
        ) : null}
        {mirror?.reportError ? (
          <div className="banner banner-warn" role="alert">
            <p>Studionet read failed: {mirror.reportError}</p>
            <button
              className="btn"
              type="button"
              data-testid="retry-mirror-read"
              onClick={() => setMirrorRefreshIndex((i) => i + 1)}
            >
              Retry Studionet read
            </button>
          </div>
        ) : null}
        {mirror?.snapshot?.reviews?.length ? (
          <ul className="list">
            {mirror.snapshot.reviews.map((review) => (
              <li key={review.sourceId}>
                <strong>{review.sourceId}</strong> · {review.fetchStatus}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="section grid-2">
        <article className="solid card">
          <h2>Frozen manifest</h2>
          <ul>
            {file.manifest.sources.map((source) => (
              <li key={source.id} className="url">{source.id} · {source.role} · {source.title} · {source.url}</li>
            ))}
          </ul>
          <p className="muted">Request id {file.manifest.clientRequestId}</p>
          <details>
            <summary>Canonical manifest</summary>
            <p className="url muted">{file.manifest.manifestCanonical}</p>
          </details>
        </article>
        <article className="solid card">
          <h2>Source reviews</h2>
          <ul className="list">
            {file.reviews.map((review) => {
              const source = file.manifest.sources.find((item) => item.id === review.sourceId);
              return (
                <li key={review.sourceId}>
                  <strong>{source?.title}</strong> · {review.fetchStatus}
                  {review.stance ? ` · stance ${review.stance}` : ""}
                  <p className="muted">{review.limitations || "Pending. Not reviewed."}</p>
                  {review.contributions.map((contribution) => (
                    <blockquote key={contribution.id} className="quote">{contribution.quote}</blockquote>
                  ))}
                </li>
              );
            })}
          </ul>
        </article>
      </section>

      <section className="section">
        <div className="tabs" role="tablist" aria-label="Evidence views">
          {(["list", "graph", "collapse"] as const).map((item) => (
            <button
              key={item}
              className="btn"
              type="button"
              role="tab"
              id={`tab-${item}`}
              aria-selected={tab === item}
              aria-controls={`panel-${item}`}
              tabIndex={tab === item ? 0 : -1}
              onClick={() => setTab(item)}
              onKeyDown={(event) => {
                const order = ["list", "graph", "collapse"] as const;
                const index = order.indexOf(tab);
                if (event.key === "ArrowRight") setTab(order[(index + 1) % order.length]);
                if (event.key === "ArrowLeft") setTab(order[(index + 2) % order.length]);
              }}
            >
              {item === "list" ? "List" : item === "graph" ? "Graph" : "Collapse"}
            </button>
          ))}
        </div>
        {tab === "list" ? (
          <div role="tabpanel" id="panel-list" aria-labelledby="tab-list" className="solid card">
            {file.relationships.length === 0 ? <p>Relationships appear after source reviews are sealed.</p> : (
              <table className="rel">
                <caption className="muted">Same relationships as the graph.</caption>
                <thead>
                  <tr><th>From</th><th>Type</th><th>Toward</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {file.relationships.map((item) => (
                    <RelationshipRow key={item.id} item={item} title={sourceTitle} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
        {tab === "graph" ? (
          <div role="tabpanel" id="panel-graph" aria-labelledby="tab-graph" className="graph">
            <div className="list">
              {file.manifest.sources.map((source) => <article key={source.id} className="solid node"><strong>{source.title}</strong><p className="muted">{source.id}</p></article>)}
            </div>
            <p className="collapse-mark">depends / distinct / unresolved</p>
            <div className="list">
              {(file.report?.families ?? groupLabels(file)).map((family) => (
                <article key={family.originLabel} className="glass node">
                  <strong>{family.originLabel}</strong>
                  <p className="muted">{family.reviewed ? "Observed in this set" : "Origin gap"}</p>
                </article>
              ))}
              {file.relationships.length === 0 ? <p>No edges until seal.</p> : null}
            </div>
          </div>
        ) : null}
        {tab === "collapse" ? (
          <div role="tabpanel" id="panel-collapse" aria-labelledby="tab-collapse" className="list">
            {families.length === 0 ? <p className="solid card">Collapse is available from the finalized report.</p> : families.map((family) => (
              <article key={family.originLabel} className="glass card">
                <h3>{family.originLabel}</h3>
                <p>{family.reviewed ? "Reviewed origin." : "Origin gap — referenced, not reviewed."}</p>
                <p className="muted">{family.sourceIds.map((sourceIdItem) => sourceTitle.get(sourceIdItem) ?? sourceIdItem).join(" · ")}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {file.report ? (
        <section className="section solid card" data-testid="report">
          <h2>Removal impact</h2>
          <p className="muted">Display only. Registered evidence is not rewritten.</p>
          {families.map((family) => (
            <label key={family.originLabel} className="check">
              <input
                type="checkbox"
                checked={hidden.includes(family.originLabel)}
                onChange={() =>
                  setHidden((current) =>
                    current.includes(family.originLabel)
                      ? current.filter((label) => label !== family.originLabel)
                      : [...current, family.originLabel],
                  )
                }
              />
              <span>Hide {family.originLabel}</span>
            </label>
          ))}
          <p data-testid="removal">{impact?.statement}</p>
          <h2>Limitations</h2>
          <ul>{file.report.limitations.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="muted">{file.report.relationshipCoverage}. Contract identity: {file.report.contractIdentity}.</p>
        </section>
      ) : null}

      <section className="section">
        <h2>Receipts</h2>
        <ul className="list">
          {file.receipts.map((item) => (
            <li key={item.id} className="solid card">
              <strong>{item.method}</strong> · {item.phase} · execution {item.execution}
              <p className="muted">{item.detail}</p>
              <p className="url muted">{item.at} · chain tx: none</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section solid card">
        <h2>Direct reads</h2>
        <p className="muted url">Studionet contract {CONTRACT_ADDRESS}. Deployment {DEPLOYMENT_TX}. A Direct Mode read is the browser ledger. Read Studionet asks the contract and does not create a transaction hash.</p>
        <label className="lbl">
          Method
          <select className="field" data-testid="read-method" value={view} onChange={(event) => setView(event.target.value as ViewName)}>
            {VIEWS.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        {view === "get_source_review" ? (
          <label className="lbl">
            Source id
            <input className="field" value={sourceId} onChange={(event) => setSourceId(event.target.value)} />
          </label>
        ) : null}
        {!file.chain?.caseId ? (
          <label className="lbl">
            Public Studionet case id
            <input className="field" data-testid="public-case-id" value={publicCaseId} onChange={(event) => setPublicCaseId(event.target.value)} />
            <span className="muted">Reads only. This is not the Direct Mode id above.</span>
          </label>
        ) : null}
        <div className="row">
          <button className="btn btn-primary" type="button" data-testid="local-read" onClick={runLocalRead}>Read Direct Mode ledger</button>
          <button className="btn" type="button" data-testid="chain-read" disabled={!chainConfigured()} onClick={() => void runChainRead()}>Read Studionet</button>
        </div>
        <p className="muted">{readMeta}</p>
        {readOut ? <pre className="url" data-testid="read-out">{readOut}</pre> : null}
      </section>

      <div className="row section">
        <button className="btn" type="button" data-testid="export-json" onClick={exportJson}>Export JSON</button>
        <button className="btn" type="button" onClick={() => void share()}>Copy share link</button>
        <Link className="btn" to="/app/new" search={{ parent: file.id }}>Reanalyze as a new case</Link>
      </div>
    </div>
  );
}

function RelationshipRow({ item, title }: { item: Relationship; title: Map<string, string> }) {
  const toward = item.toSourceId ? (title.get(item.toSourceId) ?? item.toSourceId) : item.type === "distinct_evidence_shown" ? "Primary document" : "Unreviewed origin";
  return (
    <tr>
      <td>{title.get(item.fromSourceId) ?? item.fromSourceId}</td>
      <td>{item.type.replaceAll("_", " ")}{item.toSourceId === null && item.type !== "distinct_evidence_shown" ? " · origin gap" : ""}</td>
      <td>{toward}<div className="muted">{item.explanation}</div></td>
      <td>{item.status}</td>
    </tr>
  );
}

function groupLabels(file: CaseFile) {
  const map = new Map<string, { originLabel: string; reviewed: boolean }>();
  for (const item of file.relationships) {
    map.set(item.originLabel, { originLabel: item.originLabel, reviewed: Boolean(item.toSourceId) || item.type === "distinct_evidence_shown" });
  }
  return [...map.values()];
}
