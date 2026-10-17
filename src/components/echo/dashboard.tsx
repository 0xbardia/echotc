import { Link } from "@tanstack/react-router";
import { chainConfigured, CONTRACT_ADDRESS } from "@/lib/echo/chain";
import { callView } from "@/lib/echo/engine";
import { useEcho } from "@/lib/echo/store";
import { PREVIEW_PRINCIPAL } from "@/lib/echo/types";
import { useLedgerReady } from "./use-ledger";

export function Dashboard() {
  const ready = useLedgerReady();
  const principal = useEcho((state) => state.principal);
  const caseMap = useEcho((state) => state.ledger.cases);
  const cases = Object.values(caseMap);
  const ledger = useEcho((state) => state.ledger);
  const count = callView(ledger, "get_case_count", {});
  const policy = callView(ledger, "get_policy_version", {});
  const mine = cases.filter((item) => item.owner === principal);
  const others = cases.filter((item) => item.owner !== principal);

  return (
    <div className="wrap">
      <p className="kicker">Desk</p>
      <h1>Cases on this device</h1>
      <div className="banner banner-warn">
        <strong>{chainConfigured() ? "Studionet contract is deployed." : "Contract unconfigured. Chain writes are disabled."}</strong>
        <p className="muted">
          {chainConfigured()
            ? `Address ${CONTRACT_ADDRESS}. Direct Mode cases in this browser are not that contract’s cases.`
            : "You are in Direct Mode. Records live in this browser. They are not Studionet consensus, and no transaction hash is invented."}
          {" "}
          {principal === PREVIEW_PRINCIPAL
            ? "No wallet is connected, so new cases use a preview session."
            : `Connected as ${principal}.`}
        </p>
      </div>
      {!ready ? <div className="skeleton" role="status" aria-label="Opening the local ledger" /> : null}
      <div className="row">
        <Link className="btn btn-primary" to="/app/new" search={{ parent: "" }}>New case</Link>
        <Link className="btn" to="/docs">Policy and methods</Link>
      </div>
      <section className="section">
        <h2>Your cases</h2>
        {ready && mine.length === 0 ? (
          <p className="empty">No cases for this principal yet. The labeled example takes one confirm and a short approval queue.</p>
        ) : (
          <ul className="list">
            {mine.map((item) => (
              <li key={item.id} className="glass card">
                <p className="kicker">{item.status}</p>
                <h3>{item.manifest.claim}</h3>
                <p className="muted url">{item.id} · updated {item.updatedAt}</p>
                <Link className="btn" to="/cases/$id" params={{ id: item.id }}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {others.length ? (
        <section className="section">
          <h2>Other principals</h2>
          <p className="muted">Reads are public. You cannot advance a case you do not own.</p>
          <ul className="list">
            {others.map((item) => (
              <li key={item.id} className="solid card">
                <h3>{item.manifest.claim}</h3>
                <p className="url muted">{item.owner}</p>
                <Link className="btn" to="/cases/$id" params={{ id: item.id }}>Read</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="section solid card">
        <h2>Public reads</h2>
        <p>Direct Mode ledger. Source is this browser, not a chain timestamp.</p>
        <p className="url">get_case_count → {count.ok ? String(count.value) : count.error}</p>
        <p className="url">get_policy_version → {policy.ok ? String(policy.value) : policy.error}</p>
      </section>
    </div>
  );
}
