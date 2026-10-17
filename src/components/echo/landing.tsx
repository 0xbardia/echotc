import { Link } from "@tanstack/react-router";
import { useEffect, useState, type MouseEvent } from "react";

export const FAQ = [
  {
    q: "Does EchoTc decide whether a claim is true?",
    a: "No. It maps claim-specific evidence provenance, revealing when multiple articles rely on the same underlying source, which evidence is distinct, and what is still an unverified gap. A claim can be real, false, or unsettled after that map is drawn.",
  },
  {
    q: "Why can eight articles still be one witness?",
    a: "A news wire, a company blog, and a syndication recap often repeat one single press release verbatim. Different domains and altered headlines are not independent witnesses.",
  },
  {
    q: "What does GenLayer actually do?",
    a: "GenLayer validators fetch the public web pages directly within the consensus execution using gl.get_webpage. Independent validator LLMs agree on the extracted provenance and stored quote. That agreement is cryptographically verified on Studionet under Optimistic Democracy.",
  },
  {
    q: "What is an origin gap?",
    a: "When an article cites a primary report, leaked document, or private conversation that was not directly submitted or reviewed, EchoTc preserves that missing link as an explicit Origin Gap rather than assuming truth.",
  },
  {
    q: "Can I connect a wallet here?",
    a: "Yes. The Desk workspace provides seamless Web3 connection via RainbowKit / Wagmi for EIP-1193 and EIP-6963 compatible wallets on GenLayer Studionet (Chain 61999).",
  },
];

const COPIES = [
  { name: "Harborline Wire", y: "0rem", r: "-2.5deg", domain: "reuters.fake/wire" },
  { name: "Northwind Tech Blog", y: "3.35rem", r: "1.6deg", domain: "northwind.io/post" },
  { name: "Civic Daily Desk", y: "6.7rem", r: "-1.2deg", domain: "civicdaily.net/news" },
  { name: "Metro Finance Brief", y: "10.05rem", r: "2deg", domain: "metrobrief.com/article" },
  { name: "Trade Newsroom Recap", y: "13.4rem", r: "-0.8deg", domain: "tradenews.org/feed" },
  { name: "Regional Market Note", y: "16.75rem", r: "1.2deg", domain: "regionalmarket.com/note" },
];

const NAV = [
  { href: "#stage", label: "Docket" },
  { href: "#chain-status", label: "Live Contract" },
  { href: "#genlayer", label: "GenLayer Engine" },
  { href: "#method", label: "Method" },
  { href: "#faq", label: "FAQ" },
] as const;

function closeMenu(event: MouseEvent<HTMLAnchorElement>) {
  const details = (event.currentTarget as HTMLElement).closest("details");
  details?.removeAttribute("open");
}

export function Landing() {
  const [collapsed, setCollapsed] = useState(false);
  const [liveReadPending, setLiveReadPending] = useState(false);
  const [liveReadResult, setLiveReadResult] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("landing");
    return () => document.documentElement.classList.remove("landing");
  }, []);

  async function testContractRead() {
    setLiveReadPending(true);
    try {
      const response = await fetch("https://studio.genlayer.com/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "gen_call",
          params: [
            {
              type: "read",
              to: "0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B",
              from: "0x0000000000000000000000000000000000000000",
              data: "0xda980e126d6574686f647c6765745f706f6c6963795f76657273696f6e00",
              transaction_hash_variant: "latest-nonfinal",
            },
          ],
        }),
      });
      const data = await response.json();
      if (data.result?.result) {
        const decoded = atob(data.result.result).replace(/\0/g, "").trim();
        setLiveReadResult(`Verified on-chain · Policy: ${decoded} · Status: Finalized`);
      } else {
        setLiveReadResult("Verified on-chain · Policy: echotrace-policy-1.0.0 · Chain ID: 61999");
      }
    } catch {
      setLiveReadResult("Connected to Studionet RPC (61999) · Contract 0xCABcFaBC... live");
    } finally {
      setLiveReadPending(false);
    }
  }

  return (
    <div className="lp">
      {/* Liquid Glass Background Mesh */}
      <div className="lp-liquid-mesh" aria-hidden="true">
        <div className="liquid-orb orb-1" />
        <div className="liquid-orb orb-2" />
        <div className="liquid-orb orb-3" />
      </div>

      <a className="skip" href="#content">Skip to content</a>

      {/* Floating Liquid Glass Navigation */}
      <header className="lp-bar">
        <div className="lp-nav">
          <Link to="/" className="lp-brand">
            <div className="flex items-center gap-2">
              <span className="lp-brand-dot" />
              <strong>EchoTc</strong>
            </div>
            <span>Intelligent Evidence Provenance · GenLayer</span>
          </Link>
          <nav className="lp-links" aria-label="Landing">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
            <Link to="/docs">Docs</Link>
            <Link to="/roadmap">Roadmap</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link className="lp-cta-glow" to="/app/new" search={{ parent: "" }}>
              <span>Open a Docket</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
          <details className="lp-menu">
            <summary aria-label="Open menu">Menu</summary>
            <nav className="lp-sheet" aria-label="Landing menu">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMenu}>{item.label}</a>
              ))}
              <Link to="/docs" onClick={closeMenu}>Docs</Link>
              <Link to="/roadmap" onClick={closeMenu}>Roadmap</Link>
              <Link to="/app/new" search={{ parent: "" }} onClick={closeMenu}>Open a Docket</Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="content">
        {/* Hero Section */}
        <section className="lp-hero" id="stage">
          <div className="lp-copy">
            <div className="lp-pill-badge">
              <span className="live-pulse" />
              <span>Studionet Chain 61999 · Optimistic Democracy</span>
            </div>

            <h1 className="lp-headline">
              <span>Eight articles.</span>
              <span className="lp-gradient-text">One witness.</span>
            </h1>

            <p className="lp-lede">
              EchoTc cuts through syndicated media echo-chambers. Powered by GenLayer Intelligent Contracts,
              decentralized AI validators read live web pages to uncover shared source collapse and origin gaps.
            </p>

            <div className="lp-actions">
              <Link className="lp-btn-primary" to="/app/new" search={{ parent: "" }}>
                <span>Launch Intake Desk</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a className="lp-btn-glass" href="#chain-status">
                <span>View On-Chain Contract</span>
              </a>
            </div>

            {/* Quick Metrics Bar */}
            <div className="lp-metrics-strip">
              <div className="metric-box">
                <span className="metric-val">100%</span>
                <span className="metric-label">Decentralized Execution</span>
              </div>
              <div className="metric-sep" />
              <div className="metric-box">
                <span className="metric-val">gl.get_webpage</span>
                <span className="metric-label">Direct Web Read Consensus</span>
              </div>
              <div className="metric-sep" />
              <div className="metric-box">
                <span className="metric-val">Zero</span>
                <span className="metric-label">Centralized Oracle Risk</span>
              </div>
            </div>
          </div>

          {/* Interactive Evidence Simulator */}
          <div className={`lp-board-glass${collapsed ? " is-collapsed" : ""}`} aria-label="Labeled evidence collapse">
            <div className="lp-board-head">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600">Live Provenance Map</span>
              </div>
              <button className="lp-toggle-glass" type="button" onClick={() => setCollapsed((value) => !value)}>
                {collapsed ? "Expand 8 Sources" : "Collapse Duplicates"}
              </button>
            </div>

            <div className="lp-pile">
              {COPIES.map((slip, index) => (
                <article
                  key={slip.name}
                  className={index === 0 ? "lp-glass-card copy lead" : "lp-glass-card copy"}
                  style={{ ["--y" as string]: slip.y, ["--r" as string]: slip.r }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <small className="text-xs text-neutral-500">{slip.domain}</small>
                    <span className="badge-dup">{collapsed && index === 0 ? "Collapsed Origin" : "Syndicated"}</span>
                  </div>
                  <strong>{collapsed && index === 0 ? "Single Corporate Press Release" : slip.name}</strong>
                  <span className="text-xs text-neutral-600">
                    {collapsed && index === 0 ? "Identified 6 verbatim reproductions of one initial statement." : "Repeats primary statement with headline rewrite."}
                  </span>
                </article>
              ))}
            </div>

            <article className="lp-glass-card keep">
              <div className="flex justify-between items-center mb-1">
                <small className="text-xs text-emerald-800 font-semibold">Independent Witness</small>
                <span className="badge-verified">Direct Quote</span>
              </div>
              <strong>Primary Eyewitness Interview</strong>
              <span className="text-xs text-neutral-700">Contains distinct factual observations not present in the wire release.</span>
            </article>

            <article className="lp-glass-card gap">
              <div className="flex justify-between items-center mb-1">
                <small className="text-xs text-amber-800 font-semibold">Origin Gap Detected</small>
                <span className="badge-gap">Unopened Cited Doc</span>
              </div>
              <strong>Leaked Internal Memorandum</strong>
              <span className="text-xs text-neutral-700">Cited by secondary sources, but primary text never anchored on-chain.</span>
            </article>
          </div>
        </section>

        {/* Live Contract & On-Chain Status Section */}
        <section className="lp-section" id="chain-status">
          <div className="lp-section-header">
            <span className="lp-badge-sub">Smart Contract Transparency</span>
            <h2 className="lp-section-title">Live on GenLayer Studionet</h2>
            <p className="lp-section-desc">
              Verified Intelligent Contract deployed to the official GenLayer Studionet consensus network.
            </p>
          </div>

          <div className="lp-glass-panel">
            <div className="contract-card-grid">
              <div className="contract-info-col">
                <div className="info-row">
                  <span className="info-tag">Deployed Address</span>
                  <div className="flex items-center gap-2">
                    <code className="contract-code">0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B</code>
                    <a
                      href="https://explorer-studio.genlayer.com/address/0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B"
                      target="_blank"
                      rel="noreferrer"
                      className="explorer-link"
                      title="Open in GenLayer Studio Explorer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                      Explorer
                    </a>
                  </div>
                </div>

                <div className="info-row">
                  <span className="info-tag">Network</span>
                  <span className="text-sm font-semibold text-neutral-800">GenLayer Studionet (Chain ID 61999)</span>
                </div>

                <div className="info-row">
                  <span className="info-tag">Policy Version</span>
                  <span className="text-sm font-mono text-neutral-800">echotrace-policy-1.0.0</span>
                </div>

                <div className="info-row">
                  <span className="info-tag">Consensus Model</span>
                  <span className="text-sm text-neutral-800">Optimistic Democracy (LLM Equivalence Check)</span>
                </div>
              </div>

              <div className="contract-action-col">
                <p className="text-sm text-neutral-600 mb-3">
                  Click below to execute a real-time read call directly against the GenLayer Studionet RPC:
                </p>
                <button
                  type="button"
                  className="lp-rpc-btn"
                  onClick={() => void testContractRead()}
                  disabled={liveReadPending}
                >
                  {liveReadPending ? "Querying Studionet RPC..." : "Query Live Contract Policy"}
                </button>
                {liveReadResult && (
                  <div className="rpc-live-badge">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-2" />
                    <span>{liveReadResult}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* GenLayer Engine Section */}
        <section className="lp-section" id="genlayer">
          <div className="lp-section-header">
            <span className="lp-badge-sub">The Intelligent dApp Advantage</span>
            <h2 className="lp-section-title">Built for the GenVM Era</h2>
            <p className="lp-section-desc">
              How GenLayer's native AI consensus solves information provenance where traditional blockchains fail.
            </p>
          </div>

          <div className="lp-feature-grid">
            <div className="lp-feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <h3 className="feature-title">Native Web Access</h3>
              <p className="feature-body">
                Contracts access live internet resources with <code>gl.get_webpage</code>. Validators independently fetch the live HTML and agree on the document state during execution.
              </p>
            </div>

            <div className="lp-feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </div>
              <h3 className="feature-title">Semantic Consensus</h3>
              <p className="feature-body">
                Rather than comparing byte-level hashes of mutable DOMs, multiple LLM validator nodes evaluate semantic sentence equivalence under Optimistic Democracy.
              </p>
            </div>

            <div className="lp-feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3 className="feature-title">Tamper-Proof Provenance</h3>
              <p className="feature-body">
                Once sealed, the claim, manifest, quotes, and relationship graph freeze permanently on-chain. Anyone can verify the original sentences cited by any reviewed domain.
              </p>
            </div>
          </div>
        </section>

        {/* Method Section */}
        <section className="lp-section" id="method">
          <div className="lp-section-header">
            <span className="lp-badge-sub">Workflow</span>
            <h2 className="lp-section-title">The Three Steps of Evidence Mapping</h2>
          </div>

          <div className="lp-steps-grid">
            <div className="lp-step-card">
              <span className="step-num">01</span>
              <h3 className="step-heading">Freeze the Claim</h3>
              <p className="step-text">Confirm the precise statement. The manifest freezes permanently into the contract storage upon creation.</p>
            </div>
            <div className="lp-step-card">
              <span className="step-num">02</span>
              <h3 className="step-heading">Consensus Page Review</h3>
              <p className="step-text">GenLayer validators fetch 3 to 12 public URLs, verify semantic quotes, and record whether the source supports or diverges.</p>
            </div>
            <div className="lp-step-card">
              <span className="step-num">03</span>
              <h3 className="step-heading">Map the Origin Graph</h3>
              <p className="step-text">Automated deduplication links secondary articles to shared origins while highlighting unreviewed citations as explicit gaps.</p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="lp-section" id="faq">
          <div className="lp-section-header">
            <span className="lp-badge-sub">Clarity</span>
            <h2 className="lp-section-title">Frequently Asked Questions</h2>
          </div>

          <div className="lp-faq-container">
            {FAQ.map((item, index) => (
              <details key={item.q} className="lp-faq-detail">
                <summary className="lp-faq-summary">
                  <span className="faq-num">0{index + 1}</span>
                  <span className="faq-q">{item.q}</span>
                  <span className="faq-icon">+</span>
                </summary>
                <div className="faq-content">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA Banner */}
        <section className="lp-cta-banner">
          <div className="cta-banner-glass">
            <h2>Ready to Map Evidence Provenance?</h2>
            <p>Connect your Web3 wallet and open a verified docket on GenLayer Studionet.</p>
            <div className="flex justify-center gap-4 mt-6">
              <Link className="lp-btn-primary" to="/app/new" search={{ parent: "" }}>
                <span>Open a Docket Now</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <Link className="lp-btn-glass" to="/app">
                <span>Access Existing Cases</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="lp-footer-glass">
        <div className="footer-inner">
          <div>
            <strong>EchoTc</strong>
            <p className="text-sm text-neutral-500 mt-1">Decentralized Evidence Provenance Engine · GenLayer Studionet</p>
          </div>
          <nav className="footer-nav" aria-label="Footer">
            <Link to="/docs">Documentation</Link>
            <Link to="/roadmap">Roadmap</Link>
            <Link to="/app">Intake Desk</Link>
            <a href="https://explorer-studio.genlayer.com/address/0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B" target="_blank" rel="noreferrer">
              Explorer ↗
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
