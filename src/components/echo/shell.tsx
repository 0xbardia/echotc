import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { PREVIEW_PRINCIPAL } from "@/lib/echo/types";
import { useEcho } from "@/lib/echo/store";
import { ConnectSlot } from "./wallet-provider";

const LINKS = [
  { to: "/app", label: "Desk" },
  { to: "/app/new", label: "New case" },
  { to: "/docs", label: "Docs" },
  { to: "/roadmap", label: "Roadmap" },
] as const;

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <>
      {LINKS.map((link) => {
        const current = pathname === link.to || (link.to === "/app" && pathname.startsWith("/cases"));
        if (link.to === "/app/new") {
          return (
            <Link
              key={link.to}
              to={link.to}
              search={{ parent: "" }}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
            >
              {link.label}
            </Link>
          );
        }
        return (
          <Link
            key={link.to}
            to={link.to}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

export function SiteHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const principal = useEcho((state) => state.principal);
  const [scrolled, setScrolled] = useState(false);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const query = window.matchMedia("(max-width: 1080px)");
    const onWidth = () => setNarrow(query.matches);
    onWidth();
    query.addEventListener("change", onWidth);
    return () => {
      window.removeEventListener("scroll", onScroll);
      query.removeEventListener("change", onWidth);
    };
  }, []);

  return (
    <header className={scrolled ? "site-header scrolled" : "site-header"}>
      <a className="skip" href="#content">Skip to content</a>
      <div className="nav-inner">
        <Link to="/" className="brand">
          <strong>EchoTc</strong>
          <span>Provenance, not a verdict</span>
        </Link>
        {narrow ? null : (
          <nav className="nav-links" aria-label="Primary">
            <NavLinks pathname={pathname} />
          </nav>
        )}
        <ConnectSlot />
        {narrow ? (
        <details className="mobile-nav">
          <summary className="btn menu-btn" aria-label="Open menu">Menu</summary>
          <nav className="menu-panel" aria-label="Mobile">
            <NavLinks
              pathname={pathname}
              onNavigate={(event) => {
                const details = (event.currentTarget as HTMLElement).closest("details");
                details?.removeAttribute("open");
              }}
            />
            <p className="muted url">
              {principal === PREVIEW_PRINCIPAL
                ? "Preview session. Not a wallet signature."
                : `Wallet ${principal}`}
            </p>
          </nav>
        </details>
        ) : null}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div>
          <strong>EchoTc</strong>
          <p className="muted">Eight articles can still be one witness. Claims are not certified.</p>
        </div>
        <nav aria-label="Footer">
          <div className="row">
            <Link to="/docs">Documentation</Link>
            <Link to="/roadmap">Roadmap</Link>
            <Link to="/app/new" search={{ parent: "" }}>Start a case</Link>
          </div>
        </nav>
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const started = useRef(false);

  useEffect(() => {
    const key = "echotc-path";
    const legacyKey = "echotrace-path";
    const here = `${pathname}${searchStr ?? ""}`;
    if (!started.current) {
      started.current = true;
      let saved = null;
      try {
        saved = sessionStorage.getItem(key) || sessionStorage.getItem(legacyKey);
      } catch {
        // Storage access may throw in restricted/iframe environments
      }
      if (pathname === "/" && saved?.startsWith("/cases/")) {
        const id = saved.slice("/cases/".length).split(/[?#]/)[0];
        let raw = null;
        try {
          raw = localStorage.getItem("echotc-ledger-v1") || localStorage.getItem("echotrace-ledger-v1");
        } catch {
          // Storage access may throw in restricted/iframe environments
        }
        if (id && raw?.includes(`"${id}"`)) {
          router.history.push(saved);
          return;
        }
      }
    }
    if (pathname === "/" || pathname.startsWith("/cases/")) {
      try {
        sessionStorage.setItem(key, here);
      } catch {
        // Storage access may throw in restricted/iframe environments
      }
    }
  }, [pathname, router, searchStr]);

  if (pathname === "/") return <>{children}</>;
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
    </>
  );
}
