import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EXAMPLE_CLAIM, EXAMPLE_URLS, INJECTION_URL, PUBLIC_CLAIM, PUBLIC_URLS } from "@/lib/echo/fixtures";
import { canonicalManifest, clarificationNote, preflight } from "@/lib/echo/policy";
import { runPreflight } from "@/lib/echo/preflight.functions";
import { useEcho } from "@/lib/echo/store";
import { MAX_CLAIM, POLICY_VERSION, type Draft } from "@/lib/echo/types";
import { buildSources } from "@/lib/echo/policy";
import { useLedgerReady } from "./use-ledger";

const STEPS = ["Claim", "Sources", "Preflight", "Manifest"] as const;

function freshDraft(parentCaseId: string | null): Draft {
  return {
    id: crypto.randomUUID(),
    claim: "",
    urls: ["", "", ""],
    discoveries: [],
    clientRequestId: null,
    parentCaseId,
    updatedAt: new Date().toISOString(),
  };
}

export function NewCase({ parentId }: { parentId: string }) {
  const ready = useLedgerReady();
  const navigate = useNavigate();
  const parent = useEcho((state) => (parentId ? state.ledger.cases[parentId] : undefined));
  const saveDraft = useEcho((state) => state.saveDraft);
  const createFromDraft = useEcho((state) => state.createFromDraft);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => freshDraft(parentId || null));
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverNote, setServerNote] = useState("");
  const [digest, setDigest] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!ready || seeded || !parent) return;
    setDraft((current) => ({
      ...current,
      claim: parent.manifest.claim,
      urls: parent.manifest.sources.filter((source) => source.role === "submitted").map((source) => source.url),
      parentCaseId: parent.id,
    }));
    setSeeded(true);
  }, [parent, ready, seeded]);

  const urls = draft.urls.map((url) => url.trim()).filter(Boolean);
  const local = useMemo(() => preflight(draft.claim, urls), [draft.claim, urls]);
  const note = clarificationNote(draft.claim);
  const sources = buildSources(local.urls, draft.discoveries.filter((url) => local.suggestions.some((item) => item.url === url) || local.urls.includes(url)));
  const canonical = draft.clientRequestId
    ? canonicalManifest({
        claim: draft.claim,
        sources,
        clientRequestId: draft.clientRequestId,
        parentCaseId: draft.parentCaseId,
      })
    : "";

  useEffect(() => {
    if (!canonical) return;
    let cancel = false;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)).then((buffer) => {
      if (cancel) return;
      const hex = [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      setDigest(hex);
    });
    return () => {
      cancel = true;
    };
  }, [canonical]);

  function update(partial: Partial<Draft>) {
    setDraft((current) => {
      const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
      if (step < 3) next.clientRequestId = null;
      return next;
    });
    setConfirmed(false);
    setError("");
  }

  async function goPreflight() {
    setBusy(true);
    setError("");
    try {
      const remote = await runPreflight({ data: { claim: draft.claim, urls } });
      setServerNote("Preflight ran on the server with the same policy module. Suggestions are preparation, not evidence.");
      if (!remote.ok) setError(remote.errors.join(" "));
      else setStep(2);
    } catch {
      setServerNote("Server preflight was unreachable. The same checks ran in the browser. This is still not chain evidence.");
      if (!local.ok) setError(local.errors.join(" "));
      else setStep(2);
    } finally {
      setBusy(false);
    }
  }

  function enterManifest() {
    const requestId = crypto.randomUUID();
    const next = { ...draft, clientRequestId: requestId, updatedAt: new Date().toISOString() };
    setDraft(next);
    saveDraft(next);
    setStep(3);
  }

  async function create() {
    if (!confirmed || !draft.clientRequestId) {
      setError("Confirm the exact manifest before creating the case.");
      return;
    }
    setBusy(true);
    const result = createFromDraft(draft, new Date().toISOString());
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await navigate({ to: "/cases/$id", params: { id: result.caseId } });
  }

  return (
    <div className="wrap">
      <p className="kicker">New case</p>
      <h1>Freeze one claim.</h1>
      {parentId ? <p className="banner">Reanalysis of {parentId}. This becomes a new case linked to that parent. It does not edit the old one.</p> : null}
      <div className="stepper" aria-label="Case steps">
        {STEPS.map((label, index) => (
          <span key={label} className={index === step ? "on" : undefined}>{index + 1}. {label}</span>
        ))}
      </div>

      {step === 0 ? (
        <section className="solid card">
          <label className="lbl" htmlFor="claim">
            Exact claim
            <textarea
              id="claim"
              className="area"
              maxLength={MAX_CLAIM}
              value={draft.claim}
              data-testid="claim-input"
              onChange={(event) => update({ claim: event.target.value })}
            />
          </label>
          <p className="muted">{draft.claim.trim().length}/{MAX_CLAIM}</p>
          {note ? (
            <div className="banner banner-warn">
              <p>{note}</p>
              <button
                className="btn"
                type="button"
                onClick={() => update({ claim: EXAMPLE_CLAIM })}
              >
                Use the example wording
              </button>
            </div>
          ) : null}
          <div className="row">
            <button
              className="btn"
              type="button"
              data-testid="use-example"
              onClick={() => {
                update({ claim: EXAMPLE_CLAIM, urls: EXAMPLE_URLS });
                setStep(1);
              }}
            >
              Use the labeled Harborline example
            </button>
            <button
              className="btn"
              type="button"
              data-testid="use-public"
              onClick={() => {
                update({ claim: PUBLIC_CLAIM, urls: PUBLIC_URLS });
                setStep(1);
              }}
            >
              Use the public-web example
            </button>
            <button className="btn btn-primary" type="button" disabled={!draft.claim.trim()} onClick={() => setStep(1)}>
              Continue to sources
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="solid card">
          <div className="row">
            <button
              className="btn"
              type="button"
              data-testid="load-example"
              onClick={() => update({ claim: draft.claim || EXAMPLE_CLAIM, urls: EXAMPLE_URLS })}
            >
              Load labeled example
            </button>
            <button className="btn" type="button" onClick={() => update({ urls: [...draft.urls, INJECTION_URL] })}>
              Add injection fixture
            </button>
          </div>
          <div className="list" style={{ marginTop: "1rem" }}>
            {draft.urls.map((url, index) => (
              <label key={index} className="lbl">
                URL {index + 1}
                <input
                  className="field url"
                  value={url}
                  data-testid={`url-${index}`}
                  onChange={(event) => {
                    const urlsNext = [...draft.urls];
                    urlsNext[index] = event.target.value;
                    update({ urls: urlsNext });
                  }}
                />
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn" type="button" disabled={draft.urls.length >= 8} onClick={() => update({ urls: [...draft.urls, ""] })}>
              Add URL
            </button>
            <button className="btn" type="button" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary" type="button" disabled={busy} data-testid="run-preflight" onClick={() => void goPreflight()}>
              {busy ? "Checking…" : "Run preflight"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="list">
          <div className={local.ok ? "banner banner-ok" : "banner banner-warn"}>
            <strong>{local.ok ? "Preflight passed." : "Preflight failed."}</strong>
            <p className="muted">{serverNote}</p>
            {local.errors.map((item) => <p key={item} className="error">{item}</p>)}
            {local.warnings.map((item) => <p key={item}>{item}</p>)}
          </div>
          <div className="glass card">
            <h2>One-hop suggestions</h2>
            <p className="muted">Nothing here is added unless you accept it. Accepted URLs freeze with the manifest.</p>
            {local.suggestions.length === 0 ? <p>No library suggestion for this set.</p> : null}
            {local.suggestions.map((item) => {
              const on = draft.discoveries.includes(item.url);
              return (
                <label key={item.url} className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      update({
                        discoveries: on
                          ? draft.discoveries.filter((url) => url !== item.url)
                          : [...draft.discoveries, item.url],
                      })
                    }
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <span className="url muted"> {item.url}</span>
                    <span className="muted"> — {item.because}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {local.gaps.length ? (
            <div className="banner banner-warn">
              <strong>Origin gaps already visible</strong>
              {local.gaps.map((gap) => (
                <p key={gap.url} className="url">{gap.label}: {gap.url}. {gap.because}</p>
              ))}
            </div>
          ) : null}
          <div className="row">
            <button className="btn" type="button" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" type="button" disabled={!local.ok} data-testid="to-manifest" onClick={enterManifest}>
              Review manifest
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && draft.clientRequestId ? (
        <section className="list">
          <article className="solid card">
            <p className="kicker">Exact manifest · {POLICY_VERSION}</p>
            <h2>{draft.claim.trim()}</h2>
            <p className="muted">Request id, stored before approval: <span className="url">{draft.clientRequestId}</span></p>
            <p className="muted url">SHA-256 of the canonical manifest: {digest || "Computing…"}</p>
            <p className="muted">That digest identifies this manifest. It does not authenticate a publisher.</p>
            <ol>
              {sources.map((source) => (
                <li key={source.id} className="url">{source.id} · {source.role} · {source.title} · {source.url}</li>
              ))}
            </ol>
            {draft.parentCaseId ? <p>Parent case: {draft.parentCaseId}</p> : null}
          </article>
          <label className="check">
            <input type="checkbox" checked={confirmed} data-testid="confirm-manifest" onChange={(event) => setConfirmed(event.target.checked)} />
            <span>I confirm this exact claim, these sources, and policy {POLICY_VERSION}. The next approval records create_case in Direct Mode. It is not a chain signature.</span>
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setDraft((current) => ({ ...current, clientRequestId: null }));
                setStep(2);
              }}
            >
              Back and discard this request id
            </button>
            <button className="btn btn-primary" type="button" disabled={!confirmed || busy} data-testid="create-case" onClick={() => void create()}>
              {busy ? "Recording…" : "Record create_case"}
            </button>
          </div>
        </section>
      ) : null}
      {error && step !== 3 ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
