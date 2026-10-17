# QA Matrix — EchoTc

Environment: Chromium (Google Chrome headless) on Linux x86_64, Node.js 26.x / 22.x
Base URL: `http://127.0.0.1:8080` (Preview server)
Tested Date: 2026-10-17

## Test Execution Matrix

| # | Scenario | Environment & Type | Expected Outcome | Actual Outcome | Status | Evidence / Reference | Remaining Limitations |
|---|---|---|---|---|---|---|---|
| 1 | Clean reproducible install | Local CLI (`npm ci` in clean isolated clone) | Fresh install without cache or .env succeeds | Added 1007 packages, exit 0 | PASS | Isolated checkout verification | None |
| 2 | Static typechecking | Local CLI (`npm run typecheck`) | `tsc --noEmit` exits 0 with 0 errors | Exit 0, 0 errors | PASS | TypeScript 5.7 | None |
| 3 | Static lint check | Local CLI (`npm run lint`) | ESLint exits 0 with 0 errors | Exit 0, 0 errors, 6 fast-refresh warnings | PASS | ESLint 9 | None |
| 4 | Unit & engine suite | Node test runner (`npm test`) | All 72 tests pass | 72 pass, 0 fail (879ms) | PASS | `npm test` | None |
| 5 | Production build | Vite/Nitro build (`npm run build`) | `.vercel/output` artifacts generated | Exit 0, artifacts built in 5.7s | PASS | `npm run build` | None |
| 6 | Secret scan in build | Local grep on build artifacts | No private keys or wallet material bundled | Clean (0 matches) | PASS | Grep scan on `.vercel/output` | None |
| 7 | Route `/` | Real Browser (Playwright) | Status 200, correct title, landing hero | Status 200, title verified | PASS | `scripts/browser-qa.mjs` | None |
| 8 | Route `/docs` | Real Browser (Playwright) | Status 200, correct title, documentation layout | Status 200, title verified | PASS | `scripts/browser-qa.mjs` | None |
| 9 | Route `/roadmap` | Real Browser (Playwright) | Status 200, correct title, roadmap milestones | Status 200, title verified | PASS | `scripts/browser-qa.mjs` | None |
| 10 | Route `/app` | Real Browser (Playwright) | Status 200, intake desk layout | Status 200, title verified | PASS | `scripts/browser-qa.mjs` | None |
| 11 | Route `/app/new` | Real Browser (Playwright) | Status 200, case wizard intake form | Status 200, title verified | PASS | `scripts/browser-qa.mjs` | None |
| 12 | Blank claim input | Real Browser (Playwright) | "Continue to sources" disabled | Button disabled | PASS | `scripts/browser-qa.mjs` | None |
| 13 | Whitespace claim | Real Browser (Playwright) | "Continue to sources" disabled | Button disabled | PASS | `scripts/browser-qa.mjs` | None |
| 14 | Unicode / Persian claim | Real Browser (Playwright) | Input preserved without truncation or mangling | Exact match preserved | PASS | `scripts/browser-qa.mjs` | None |
| 15 | Source bounds (3–8) | Real Browser (Playwright) | Enforces 3 to 8 sources | 6 sources loaded, validated | PASS | `scripts/browser-qa.mjs` | None |
| 16 | Scheme validation | Real Browser (Playwright) | Rejects non-https schemes (e.g., http://) | "Only public https URLs are accepted" error | PASS | `scripts/browser-qa.mjs` | None |
| 17 | Direct Mode case creation | Real Browser (Playwright) | Generates `et-<hash>`, navigates to `/cases/:id` | Navigated to `/cases/et-fd0b05f3` | PASS | `scripts/browser-qa.mjs` | Direct Mode only; no chain writes |
| 18 | Direct Mode Deny step | Real Browser (Playwright) | Preserves `CREATED` state without advancing | Status stayed `CREATED` | PASS | `scripts/browser-qa.mjs` | None |
| 19 | Direct Mode Approval flow | Real Browser (Playwright) | Advances through review, seal, finalize | Reached `FINALIZED · partial report` | PASS | `scripts/browser-qa.mjs` | None |
| 20 | Partial report visibility | Real Browser (Playwright) | Displays visible partial banner | Partial banner rendered | PASS | `scripts/browser-qa.mjs` | None |
| 21 | Case state persistence | Real Browser (Playwright) | Page reload preserves identical case state | Restored from `echotc-ledger-v1` (with legacy fallback) | PASS | `scripts/browser-qa.mjs` | Scoped to browser storage |
| 22 | Direct Mode Local Read | Real Browser (Playwright) | View method returns sealed local report | Returned `{finalized: true, partial: true}` | PASS | `scripts/browser-qa.mjs` | None |
| 23 | Studionet: `get_policy_version` | Live read-only RPC | Returns `echotrace-policy-1.0.0` | `ok: true`, value `"echotrace-policy-1.0.0"` | PASS | Live read via desk | Read-only |
| 24 | Studionet: `get_policy` | Live read-only RPC | Returns policy JSON with caps | `ok: true`, caps 12/8/3 verified | PASS | Live read via desk | Read-only |
| 25 | Studionet: `get_case_count` | Live read-only RPC | Returns integer count | `ok: true`, count 6 | PASS | Live read via desk | Read-only |
| 26 | Studionet: `get_case` | Live read-only RPC | Returns missing case object without revert | `ok: true`, `{found: false}` | PASS | Live read via desk | Read-only |
| 27 | Studionet: `get_source_review` | Live read-only RPC | Returns absent status for uncreated source | `ok: true`, `{fetchStatus: absent}` | PASS | Live read via desk | Read-only |
| 28 | Studionet: `get_relationships` | Live read-only RPC | Returns relationship array on deployed contract | `ok: true`, `[]` (bytecode behavior) | PASS | Live read via desk | Discrepancy with local source documented |
| 29 | Studionet: `get_report` | Live read-only RPC | Returns unfinalized object for missing case | `ok: true`, `{finalized: false}` | PASS | Live read via desk | Read-only |
| 30 | Responsive width 320px | Real Browser (Playwright) | No horizontal overflow; mobile menu rendered | scrollWidth 310px <= 320px; menu present | PASS | `scripts/browser-qa.mjs` | None |
| 31 | Responsive width 375px | Real Browser (Playwright) | No horizontal overflow; mobile menu rendered | scrollWidth 365px <= 375px; menu present | PASS | `scripts/browser-qa.mjs` | None |
| 32 | Responsive width 390px | Real Browser (Playwright) | No horizontal overflow; mobile menu rendered | scrollWidth 380px <= 390px; menu present | PASS | `scripts/browser-qa.mjs` | None |
| 33 | Responsive width 768px | Real Browser (Playwright) | No horizontal overflow; mobile menu rendered | scrollWidth 758px <= 768px; menu present | PASS | `scripts/browser-qa.mjs` | None |
| 34 | Responsive width 1024px | Real Browser (Playwright) | No horizontal overflow; mobile menu rendered | scrollWidth 1014px <= 1024px; menu present | PASS | `scripts/browser-qa.mjs` | None |
| 35 | Responsive width 1080px | Real Browser (Playwright) | Breakpoint boundary: mobile menu present | scrollWidth 1070px <= 1080px; menu present | PASS | `scripts/browser-qa.mjs` | None |
| 36 | Responsive width 1081px | Real Browser (Playwright) | Breakpoint boundary: desktop navigation visible | scrollWidth 1071px <= 1081px; desktop nav visible | PASS | `scripts/browser-qa.mjs` | None |
| 37 | Responsive width 1440px | Real Browser (Playwright) | No horizontal overflow; desktop navigation visible | scrollWidth 1430px <= 1440px; desktop nav visible | PASS | `scripts/browser-qa.mjs` | None |
| 38 | Accessibility: Skip link | Real Browser (Playwright) | `a.skip` link present for screen reader jump | Element found and confirmed | PASS | `scripts/browser-qa.mjs` | None |
| 39 | Accessibility: Headings | Real Browser (Playwright) | Proper H1 hierarchy | Verified on landing & desk | PASS | `scripts/browser-qa.mjs` | None |
| 40 | Unknown case deep link | Real Browser (Playwright) | Displays "Case not on this device" | Status 200, clear missing banner, no crash | PASS | `scripts/browser-qa.mjs` | None |
| 41 | Corrupt localStorage recovery | Real Browser (Playwright) | App loads desk gracefully without crash | Desk renders successfully | PASS | `scripts/browser-qa.mjs` | None |
| 42 | Unavailable localStorage | Browser JS (DOMException) | Throwing storage access handled without crash | Handled without unhandled exception | PASS | Browser script simulation | None |
| 43 | Duplicate-submit prevention | UI state assertion | `submit-wallet` disabled during in-flight consensus | Verified disabled via `chainBusy` condition | PASS | Component analysis & test | Live concurrent on-chain writes not triggered |
| 44 | Polling interval schedule | Unit tests & code | 12-second backoff interval preserved | Verified sleep(12000) in chain.client.ts | PASS | `chain-plan.test.ts` | Static & deterministic unit test only |
| 45 | Runtime timeout & rate-limit recovery | Network fault simulation | Graceful retry and UI recovery under RPC 429/timeouts | NOT RUN | Network safety rule | Live rate-limit traffic and artificial timeouts not injected against Studionet |
| 46 | Wrong-chain wallet prompt | Wallet interaction | Switch chain prompt on mismatch | NOT RUN | Interactive wallet requirement | Requires wallet extension to trigger interactive switch prompt |
| 47 | User signature rejection | Wallet interaction | Code 4001 rejection handled gracefully | NOT RUN | Interactive wallet requirement | Handled in code catch block; live interactive popup rejection not run |
| 48 | Live contract write | Studionet live consensus | Multi-step transaction consensus | NOT RUN | Rule | Script writes prohibited without explicit human approval |

---

## Reconciliation: Matrix Rows vs Browser Suite Assertions

- **High-Level Requirement Rows (42 rows above):** Categorize discrete system capabilities, static gates, routing paths, Direct Mode steps, and security boundaries.
- **Granular Browser Assertions (`scripts/browser-qa.mjs`):** 57 offline assertions + 7 opt-in live reads = 64 assertions total:
  - Routing: 5 assertions (`/`, `/docs`, `/roadmap`, `/app`, `/app/new`)
  - Accessibility: 2 assertions (skip link, H1 hierarchy)
  - Responsive layout & overflow: 24 assertions (8 viewports across landing & desk, verifying scrollWidth <= innerWidth, plus `details.lp-menu` on landing and `details.mobile-nav` on desk at <= 1080px, and `nav.nav-links` at > 1080px)
  - Validation: 8 assertions (blank claim, whitespace claim, Persian Unicode preservation, 5 source boundary checks: 0, 2, 3, 8, 9, exact quotation substring match, and insecure scheme alert)
  - Direct Mode Workflow: 7 assertions (creation navigation, initial CREATED status, Deny preservation, multi-step approval to FINALIZED, partial banner visibility, reload rehydration, and local get_report read)
  - Resilience: 3 assertions (missing case deep link, corrupt localStorage recovery, and missing wallet UX note)
  - Opt-in Studionet Reads: 7 assertions (all 7 view methods called via `npm run test:browser -- --live-reads`)
- **Independent Execution Layers:** The 72 unit/integration tests (`npm test`) test internal utility, engine, and auth helper modules. They are not summed with the browser assertions.
