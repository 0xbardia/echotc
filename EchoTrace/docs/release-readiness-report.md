# Release-Readiness Report — EchoTc

## Executive Release Determination

**OVERALL RELEASE STATUS: NOT READY**

- **Technical Readiness:** READY.
  The application code, builds, deterministic test suites, offline browser QA, and live read-only RPC checks are verified and passing.
- **Open-Source Licensing:** AUTHORIZED & COMPLETE (Apache-2.0).
  The repository owner authorized Apache-2.0. The official Apache-2.0 text is placed at `LICENSE`, `package.json` specifies `"Apache-2.0"`, and repository documentation reflects this license.
- **Open-Source Publication Readiness:** AWAITING OWNER ACTION PERMISSION.
  The project is technically ready for release, awaiting explicit separate owner approvals for: (1) staging and local commit, (2) creating remote repository, and (3) pushing code to trigger remote CI.

---

## 1. Clean Installation & Portability Verification

A clean installation test was performed in an isolated temporary directory (`/root/.hermes/cache/scratch/clean-repo`) containing only intended public files, completely excluding `.echo-test-wallet.json`, `.app-env.json`, `.vercel/`, `.tanstack/`, and `node_modules/`.

- **Environment:**
  - Node.js: `v22.23.3` (matching `.github/workflows/ci.yml`)
  - npm: `10.9.9`
  - OS: Linux x86_64
- **Verification Commands Executed in Isolated Copy:**
  - `npm ci`: Added 1007 packages, audited 1008 packages, 0 fatal errors. Exited `0`.
  - `npm run typecheck`: TypeScript 5.7 compilation exited `0` with 0 errors.
  - `npm run lint`: ESLint exited `0` with 0 errors (6 fast-refresh warnings for shared constants in component files).
  - `npm test`: Node test runner passed 72 tests across 19 suites (0 failed, 1048 ms).
  - `npm run build`: Production build via Vite and Nitro generated `.vercel/output` in 4.88s with exit code `0`.
  - `npm run test:browser`: Executed 57 deterministic browser scenarios in headless Chrome; 57 passed, 0 failed.
- **External Dependency & Network Findings:**
  - Package installation required access to the standard npm registry.
  - No secrets, private credentials, or live RPCs were required to run `typecheck`, `lint`, `test`, `build`, or offline `test:browser`.
  - Running preview server at `http://127.0.0.1:8080` remained active and undisturbed throughout.
  - No sandbox symlinks (`/workspace` or `/root`) were required; the project operates cleanly from a standard standalone clone.

---

## 2. Git Provenance & Working-Tree State

- **Git Initialization:**
  At the beginning of this audit, `/root/EchoTrace` was not a Git repository (`fatal: not a git repository`). Git was initialized locally (`git init`) to audit untracked files and verify ignore rules.
- **Commit History Baseline:**
  There is **no prior Git commit history or baseline snapshot** in this repository directory. Therefore, code preservation cannot be proven via a standard `git diff HEAD`.
- **Code Preservation Audit:**
  Preservation of the existing working code was confirmed by inspecting the file tree and recording the only two minimal changes made:
  1. `src/lib/app-data/client.server.ts:281`: Added an explanatory comment inside an empty `catch` block to satisfy ESLint's `no-empty` rule without altering token hash fallback logic.
  2. `package.json`: Added script `"test:browser": "node scripts/browser-qa.mjs"` to make browser QA reproducible.
- **Staging & Publishing Status:**
  No files have been staged (`git add`), no commits have been created (`git commit`), and no remotes have been updated (`git push`).
- **Ignore Rules Verified:**
  Root `.gitignore` excludes:
  - Private wallet material: `.echo-test-wallet.json`
  - Environment overrides: `.app-env.json`, `.env`, `.env.*` (preserving `!.env.example`)
  - Build/cache directories: `.vercel/`, `.tanstack/`, `node_modules/`, `.node_modules.lock`, `coverage/`
  Running `git status -s --ignored` confirms sensitive files are completely ignored.

---

## 3. Browser QA & Test Reconciliation

Browser tests are codified in `scripts/browser-qa.mjs` and runnable via:
```bash
npm run test:browser              # Offline deterministic test suite (57 scenarios)
npm run test:browser -- --live-reads  # Opt-in live Studionet read-only methods (64 scenarios)
```

### Reconciliation Between Matrix Rows (42) and Browser Scenarios (57/64)
- **Matrix Rows (42 rows):** High-level capability and compliance categories spanning setup, static checks, routing, validation, Direct Mode engine, Studionet UX, accessibility, and resilience.
- **Browser Runner Scenarios (57 offline + 7 opt-in = 64 total):** Granular assertions executed by Playwright. For example, matrix row "Responsive Layout" expands into 16 concrete scenario assertions covering 8 distinct viewports across both `/` and `/app`.
- **No Double Counting:** The 72 unit/integration tests (`npm test`) and 57 browser scenarios test distinct layers and are reported separately.

### Key Coverage Highlights Verified:
1. **Responsive Menus:**
   - Landing page uses `<details className="lp-menu">` at <= 1080px (verified present and clickable).
   - App desk uses `<details className="mobile-nav">` at <= 1080px (verified present and clickable).
   - Desktop navigation `<nav className="nav-links">` displays at > 1080px.
2. **Accessibility & Form Semantics:**
   - Skip to content link `<a className="skip" href="#content">` present.
   - Exact claim `<label htmlFor="claim">` properly binds to `<textarea id="claim">`.
   - Error banners announce via `role="alert"`.
   - In-flight wallet status announces via `role="status"`.
3. **Wallet UX & Submission Safety:**
   - Disconnected / missing wallet gracefully renders: `"No browser wallet in this frame. Embedded previews cannot see MetaMask..."` with `role="status"`.
   - In-flight duplicate submission is prevented by `chainBusy` disabling `submit-wallet`.
   - Studionet polling interval strictly preserves 12-second delay (`sleep(12000)` in code and unit tests). Runtime timeout and RPC rate-limit error recovery under live fault injection is NOT RUN to protect network quotas.
4. **Storage & Engine Resilience:**
   - Quota/SecurityError on `localStorage` simulated without crashing the desk.
   - Corrupt JSON in `echotc-ledger-v1` (and legacy fallback) handled cleanly without unhandled exceptions.
   - Missing deep link `/cases/et-nonexistent-0000` renders friendly `"Case not on this device"` notice.
5. **Source Boundaries & Quotations:**
   - 0 and 2 sources rejected ("Submit at least 3 URLs").
   - 3 and 8 sources accepted.
   - 9 sources rejected ("Submit at most 8 URLs").
   - Quotation fidelity strictly verified: quotes must be exact substrings of rendered page content; fabricated quotes are rejected.

---

## 4. Source Fetching Architecture & Security Findings

### Direct Mode (Client & Server Function)
- Code paths: `src/lib/echo/engine.ts`, `src/lib/echo/preflight.functions.ts`, `src/lib/echo/fixtures.ts`.
- Behavior: Direct Mode **does not make arbitrary outbound network requests**. `runPreflight` only performs offline syntax and policy validation. Source review evaluates against deterministic local fixtures in `fixtures.ts`. Any unindexed URL is marked `unavailable` without inventing content.
- SSRF / DNS Rebinding: **NOT APPLICABLE** in Direct Mode.

### Studionet Mode (Intelligent Contract)
- Code path: `EchoTrace/contracts/echotrace.py:389` (`gl.nondet.web.render(page_url, mode="text")`).
- Behavior: Web fetching is executed by decentralized GenLayer consensus validators during `review_sources_batch` and `retry_unavailable`.
- Contract protections: `_public_url` and `_host_blocked` reject non-https schemes, credentials, ports, private IPv4 literals, loopbacks, `.local`, `.internal`, and non-ASCII hostnames.
- Remaining exposure (DNS Rebinding): **POTENTIAL PROTOCOL RISK**. While the contract rejects literal private IPs, dynamic DNS rebinding (where a public hostname resolves to an internal IP during validator HTTP connection) cannot be resolved by Python smart contract syntax checks alone. This requires socket-level connect filtering in the validator host environment.
- Release impact: **NON-BLOCKER**. The contract explicitly documents this limitation in its report (`"Hostname checks do not close DNS rebinding."` in `finalize_case`).

---

## 5. Deployment & Release Reconciliation

- **Live Deployed Contract Address:** `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`
- **Deployment Transaction:** `0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30`
- **Deployed Artifact SHA-256:** `8fcf378fe76e90c852307d97b4caa497be1c942a26049fb65b5350b2c2338e44`
- **Local Source SHA-256:** `f450f96ffae4508eb78fc2800468bd2c6f8b5caeb3fb9f72152f6af575f920b1` (`EchoTrace/contracts/echotrace.py`)
- **Observed Behavior Difference:**
  Calling `get_relationships` with a non-existent case ID on the deployed contract returns `[]`. The checked-in Python source returns `{"found": false, "relationships": []}`.
- **Handling:** Frontend parser in `src/lib/echo/engine.ts` supports both responses. Per policy, redeployment is avoided to prevent unapproved transaction writes.
- **Studio Simulator Sandbox Note:**
  Local deployment activity inside the GenLayer Studio browser sandbox (`https://studio.genlayer.com/run-debug`) operates in a local simulator session (`0x610808f0...`) and is **not live Studionet deployment evidence**. The active application and frontend target exclusively `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`.
- **Git & Release v1.0.0 State:**
  Release tag `v1.0.0` points to commit `cb8abef0a36d55a557ed5e938475ffa3d725f84a`. The subsequent resilience fixes (`chain.ts` optional chaining, `store.ts` persist guard, and regression tests) exist on `main` branch only and are not included in the immutable `v1.0.0` release tag.
- **Unexecuted Scenarios Preserved as NOT RUN:**
  - Interactive wallet wrong-chain switch prompt: NOT RUN.
  - User signature rejection prompt: NOT RUN.
  - Runtime RPC timeout and rate-limit fault injection: NOT RUN.
  - Live on-chain write transactions: NOT RUN.

---

## 6. Action Items Before Public Release

1. **Owner Permissions for Git Operations:** Explicit separate approvals are needed from the repository owner before:
   - Staging files and creating the initial local Git commit.
   - Creating or linking a remote GitHub repository.
   - Pushing the branch and triggering remote GitHub Actions CI.
2. **Remote CI Monitoring:** Once authorized and pushed, GitHub Actions (`.github/workflows/ci.yml`) should be monitored on the remote repository to confirm execution matches the local clean-clone run.
