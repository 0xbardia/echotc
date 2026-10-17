import { POLICY_VERSION } from "@/lib/echo/types";

export function DocsPage() {
  return (
    <div className="wrap">
      <p className="kicker">Documentation</p>
      <h1>How EchoTc holds a case.</h1>
      <p className="lede">Policy {POLICY_VERSION}. English analysis. Localization-ready layout, not a translated model.</p>

      <section className="section">
        <h2>What a case is</h2>
        <p>A user freezes one claim and three to eight public URLs. One-hop suggestions can be accepted before the freeze, up to twelve sources. After create_case the claim, sources, and policy do not move. Reanalysis is a new case with a parent id.</p>
      </section>
      <section className="section">
        <h2>Direct Mode and Studionet</h2>
        <p>Direct Mode receipts say consensus was not submitted. Studionet is a separate state. A wallet case can be finalized there while the Harborline example in this browser stays partial. A new local case is not the chain case until this desk signs it.</p>
        <p>On Studionet, the wallet signs each method through GenLayerJS. The server never holds a production signing key. FINALIZED in an explorer is a consensus lifecycle. It is application success only when execution returned and the case state matches.</p>
        <p>The stored quote is a sentence from the rendered page. The contract does not keep a model-written origin URL, because validators were disagreeing on free wording. A chain relationship without that URL is distinct evidence, not an inferred dependency. Origin gaps are demonstrated in Direct Mode when a labeled fixture cites a document that was not frozen.</p>
      </section>
      <section className="section">
        <h2>Public read methods</h2>
        <p>Reads do not create a transaction hash. In Direct Mode the desk labels the ledger and the time of the read. A Studionet read, once an address is configured, is a separate control and is not implied by a successful local read.</p>
        <div className="solid card">
          <table className="rel">
            <thead>
              <tr><th>Method</th><th>Arguments</th><th>What a correct result is</th></tr>
            </thead>
            <tbody>
              <tr><td>get_policy_version</td><td>none</td><td>echotrace-policy-1.0.0</td></tr>
              <tr><td>get_policy</td><td>none</td><td>Frozen caps and the partial-finalization rule</td></tr>
              <tr><td>get_case_count</td><td>none</td><td>Number of created cases, not a live user count</td></tr>
              <tr><td>get_case</td><td>case id</td><td>Owner, status, frozen manifest. A missing id returns found false.</td></tr>
              <tr><td>get_source_review</td><td>case id, source id</td><td>One review, or found false when the source is absent.</td></tr>
              <tr><td>get_relationships</td><td>case id</td><td>Object with found and the sealed schedule. A missing case returns found false and an empty schedule.</td></tr>
              <tr><td>get_report</td><td>case id</td><td>Sealed reports say finalized true. An open case returns finalized false and no invented evidence.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <h2>How a relationship is named</h2>
        <p>If a contribution has no origin URL, it is distinct evidence. If it names a URL that is inside the frozen manifest, the link is an explicit dependency. If it names a URL that was not frozen, the link is unresolved — an origin gap — even when the quote is an interview or an announcement, not merely a mention. <code>possible_dependency</code> is part of the vocabulary and is not emitted by v1, because the seal step will not invent a softer verdict than the frozen quote supports.</p>
      </section>
      <section className="section">
        <h2>Write methods</h2>
        <ul>
          <li>create_case — idempotent for the same sender, client request id, and manifest. A different manifest with the same id is rejected.</li>
          <li>review_sources_batch — the contract chooses the next pending sources, three at a time. Callers cannot skip one.</li>
          <li>seal_source_reviews — derives the relationship schedule from anchored contributions.</li>
          <li>review_relationship_batch — records that schedule. It does not accept a typed verdict and does not render the web again.</li>
          <li>finalize_case — refuses a case with no reviewed source. Partial reports stay marked.</li>
          <li>retry_unavailable — owner only, two attempts. A later success stamps evidence ids. A miss stays a miss.</li>
        </ul>
      </section>
      <section className="section">
        <h2>Evidence rules</h2>
        <p>A quote stored on Studionet is a sentence copied from the rendered page: the one with the strongest overlap with the claim. Free-form model explanations are not stored, because validators disagreed on that wording and the case never moved. Instructions inside a page are data. They cannot add sources, change policy, or set a truth flag — there is no truth flag.</p>
        <p>Stance is supports, contradicts, mentions only, or unclear. A mixed article keeps each contribution. An announcement is not treated as the event itself.</p>
      </section>
      <section className="section">
        <h2>Threats we do not pretend to close</h2>
        <p>Hostname checks are not DNS-rebinding protection. A snapshot hash is not publisher authentication. Equivalence between validators is not immunity to a page that fools every validator the same way. Direct Mode does not render arbitrary websites, so it cannot be cited as a live web review.</p>
      </section>
      <section className="section">
        <h2>Deploying the contract</h2>
        <p>The contract source is EchoTrace/contracts/echotrace.py. Address 0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B. Deployment transaction 0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30. Consensus accepted it and execution succeeded. A missing case, a missing source, and an unsealed report return JSON with found or finalized set to false. They do not revert. The previous address 0x8EB48E25fAE1F8b997b58e27F756FD0A7E1FB5Ce still holds the earlier cases, including et-41f3646a7e1f and et-280db9fe766f. An earlier deployment at 0xCBe65e90A55c3a873f1DA815970396bb25699a48 could not finish source review. Studio’s validator set is the hosted studio configuration, not a claim of independent mainnet operators.</p>
      </section>
    </div>
  );
}
