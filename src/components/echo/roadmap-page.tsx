const SHIPPED = [
  "Editorial landing, documentation, and this roadmap.",
  "Direct Mode case flow: draft, preflight, frozen manifest, batched review, seal, relationships, partial finalize.",
  "Origin gaps stay unresolved when the cited URL was not frozen, including interviews and announcements.",
  "Collapse, origin gap, removal impact, JSON export, and parent-linked reanalysis.",
  "RainbowKit for injected wallets. WalletConnect appears only when a project id is supplied.",
  "Studionet contract 0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B. Views never revert: a missing case, a missing source, and an unsealed report return found or finalized false. Earlier cases remain on 0x8EB48E25fAE1F8b997b58e27F756FD0A7E1FB5Ce.",
];

const PROGRESS = [
  "Pages that render differently for each validator can still end UNDETERMINED. The case is left unchanged. That is disagreement, not a silent pass.",
  "Direct Mode still refuses to invent quotes for hosts outside the labeled fixture library.",
];

const PLANNED = [
  "Hosted indexer with a labeled fallback timestamp, separate from direct contract reads.",
  "Signed session quotas and a Postgres ledger for drafts. This preview keeps the ledger on device on purpose.",
  "Additional languages for analysis, after English provenance is stable.",
  "Appeal flow, only if the network path is actually implemented.",
];

export function RoadmapPage() {
  return (
    <div className="wrap">
      <p className="kicker">Roadmap</p>
      <h1>What is shipped, and what is not.</h1>
      <p className="lede">No partner wall, no audit tier, no live user count.</p>
      <section className="section">
        <h2>Shipped</h2>
        <ul className="list">{SHIPPED.map((item) => <li key={item} className="solid card">{item}</li>)}</ul>
      </section>
      <section className="section">
        <h2>In progress</h2>
        <ul className="list">{PROGRESS.map((item) => <li key={item} className="glass card">{item}</li>)}</ul>
      </section>
      <section className="section">
        <h2>Planned</h2>
        <ul className="list">{PLANNED.map((item) => <li key={item} className="solid card">{item}</li>)}</ul>
      </section>
    </div>
  );
}
