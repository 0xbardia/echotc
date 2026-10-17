import { Link } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { chainConfigured, CONTRACT_ADDRESS, DEPLOYMENT_TX } from "@/lib/echo/chain";
import { chainExecutionSucceeded, nextChainCall, type ChainSnapshot } from "@/lib/echo/chain-plan";
import { callView, plan, removalImpact, retryable, type ViewName } from "@/lib/echo/engine";
import { useEcho } from "@/lib/echo/store";
import type { CaseFile, Relationship } from "@/lib/echo/types";
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

const challengeOnChain = createClientOnlyFn(async (txId: `0x${string}`, account: `0x${string}` | null) => {
  const mod = await import("@/lib/echo/chain.client");
  return mod.challengeChain(txId, account);
});

const readSnapshot = createClientOnlyFn(async (caseId: string, sourceIds: string[]) => {
  const mod = await import("@/lib/echo/chain.client");
  const caseRead = await mod.readChain("get_case", [caseId]);
  if (!caseRead.ok) throw new Error(caseRead.error);
  const parsed = typeof caseRead.value === "string" ? JSON.parse(caseRead.value) : caseRead.value;
  if (parsed && parsed.found === false) throw new Error("Studionet has no case with that id.");
  const reviews = [];
  for (const sourceId of sourceIds) {
    const review = await mod.readChain("get_source_review", [caseId, sourceId]);
    if (!review.ok) throw new Error(review.error);
    reviews.push(typeof review.value === "string" ? JSON.parse(review.value) : review.value);
  }
  const rel = await mod.readChain("get_relationships", [caseId]);
  if (!rel.ok) throw new Error(rel.error);
  const rawRelationships = typeof rel.value === "string" ? JSON.parse(rel.value) : rel.value;
  const relationships = Array.isArray(rawRelationships)
    ? rawRelationships
    : Array.isArray(rawRelationships?.relationships)
      ? rawRelationships.relationships
      : [];
  return {
    caseId,
    status: String(parsed.status),
    owner: String(parsed.owner),
    reviews,
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
  const file = useEcho((state) => state.ledger.cases[id]);
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
  const [error, setError] = useState("");
  const [mirror, setMirror] = useState<{ snapshot: ChainSnapshot | null; report: string | null; reportError: string | null } | null>(null);

  const step = file ? plan(file) : null;
  const impact = file ? removalImpact(file, hidden) : null;
  const owned = file?.owner === principal;
  const chainCaseId = file?.chain?.caseId ?? "";
  const chainFinal = Boolean(
    file?.chain?.txs.some((tx) => tx.method === "finalize_case" && chainExecutionSucceeded(tx.execution)) ||
      mirror?.snapshot?.status === "FINALIZED",
  );
  const upcoming =
    !file || chainFinal
      ? null
      : !chainCaseId
        ? nextChainCall(file, null, "preview")
        : mirror?.snapshot
          ? nextChainCall(file, mirror.snapshot, "preview")
          : null;
  const readyToSign = !chainCaseId || Boolean(mirror?.snapshot) || Boolean(mirror?.reportError);

  useEffect(() => {
    if (!chainCaseId || !file) return;
    let cancel = false;
    const sourceIds = file.manifest.sources.map((source) => source.id);
    void (async () => {
      try {
        const snapshot = await readSnapshot(chainCaseId, sourceIds);
        const report = await readOnChain("get_report", [chainCaseId]);
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
      }
    })();
    return () => {
      cancel = true;
    };
  }, [chainCaseId, file]);

  const families = file?.report?.families ?? [];
  const sourceTitle = useMemo(() => {
    const map = new Map<string, string>();
    file?.manifest.sources.forEach((source) => map.set(source.id, source.title));
    return map;
  }, [file]);

  if (!ready) return <div className="wrap"><div className="skeleton" role="status" aria-label="Opening the local ledger" /></div>;
  if (!file) {
    return (
      <div className="wrap">
        <h1>Case not on this device</h1>
        <p>Direct Mode keeps cases in this browser. There is no index entry for {id}.</p>
        <Link className="btn" to="/app">Back to the desk</Link>
      </div>
    );
  }

  function onApprove() {
    const result = approveNext(file.id, new Date().toISOString());
    setError(result.ok ? "" : result.error);
  }

  async function onChain() {
    if (!principal.startsWith("0x")) return;
    const chainOwner = (mirror?.snapshot?.owner || file.chain?.owner || "").toLowerCase();
    if (chainOwner && chainOwner !== principal.toLowerCase()) {
      setChainNote("This Studionet case is owned by a different account. Nothing was sent.");
      return;
    }
    setChainBusy(true);
    setChainNote("Preparing the next contract call from the current Studionet read.");
    try {
      let snapshot: ChainSnapshot | null = null;
      if (file.chain?.caseId) {
        const sourceIds = file.manifest.sources.map((source) => source.id);
        snapshot = await readSnapshot(file.chain.caseId, sourceIds);
      }
      const batchId = `b-${Date.now().toString(36)}`;
      const call = nextChainCall(file, snapshot, batchId);
      if (!call) {
        setChainNote("No further Studionet write is waiting. The chain case is finalized or unreadable as an open case.");
        return;
      }
      setChainNote(`Wallet prompt for ${call.method}. Consensus has not finished.`);
      const submitted = await submitOnChain(call.method, call.args, principal as `0x${string}`);
      if (!submitted) throw new Error("Wallet submission is only available in the browser.");
      const chainCaseId = submitted.caseId || snapshot?.caseId || file.chain?.caseId || null;
      let owner = snapshot?.owner || file.chain?.owner || null;
      if (submitted.ok && chainCaseId) {
        try {
          const confirmed = await readSnapshot(chainCaseId, file.manifest.sources.map((source) => source.id));
          owner = confirmed.owner;
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
        chainCaseId,
        owner,
      );
      setChainNote(
        submitted.ok
          ? `${call.method} ${submitted.hash} finalized ${submitted.statusName} / ${submitted.execution}. Chain case ${chainCaseId || "not returned"}.`
          : `${call.method} ${submitted.hash} did not succeed. ${submitted.error}`,
      );
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
        <div className="row">
          <button
            className="btn btn-primary"
            type="button"
            data-testid="submit-wallet"
            disabled={chainBusy || chainFinal || !chainConfigured() || !principal.startsWith("0x") || !readyToSign}
            onClick={() => void onChain()}
          >
            {chainBusy ? "Waiting for consensus…" : chainFinal ? "Finalized on Studionet" : "Sign this step"}
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
        {mirror?.reportError ? <p className="muted">{mirror.reportError}</p> : null}
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
