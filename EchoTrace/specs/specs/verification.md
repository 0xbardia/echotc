# Verification, repair loop, and release gates

## Capability and approval gate
Verify actual tools early. Do not presume App Builder has Python execution, persistent backend hosting, installed skills, or wallet browser control. If a capability is missing, produce the real code/config/test workflow and request the minimal needed environment. Do not replace requirements with mock features.

Read official Spec Kit, Ponytail, Playwright docs and use supported integrations. Skill invocation syntax is not automatically a shell command. If integration is unavailable, state it and apply verified templates through available tools without falsely claiming an installation.

Use a stable persistent browser profile for live wallet/Studio work. Ordinary isolated E2E profiles may remain disposable. Never reset a live profile and inadvertently lose the selected funded account. Keep auth state private and out of Git.

## Phase sequence
1. Preserve prior repository; establish isolated workspace, specs, capability and version checks.
2. Small vertical slice: valid Python contract, real VM rendering/equivalence where authorized, app wallet adapter, final-state read. Avoid polishing an unconnected frontend first.
3. Implement bounded full product and safe data/transaction boundaries.
4. Complete professional UI, backend operations, fixtures, docs.
5. Run local gates and prepare exact deployment approval.
6. Deploy final artifact from Studio UI, verify live reads/consensus.
7. Execute full user journeys only through frontend, repair defects.
8. Recheck final release and report evidence.

## Direct Mode
Use verified genlayer-test APIs, no Docker requirement, mock_web/mock_llm, CI-friendly tests.
Test state transitions, malformed inputs, discovered limits, parents, directions, fabricated quote/deferred bypass, semantic negatives, mixed origins, locked policy, attempt ownership, failed/duplicate actions, idempotent creation, prompt injection, SSRF syntactic boundaries, partial status and finalization invariants.

Tests must meaningfully exercise behavior, not mirror the implementation or accept whatever it returns.

## Backend tests
Use disposable real Postgres/Redis for concurrency/session/job integration. Test quota race, replay after logout, nonce/ownership, transaction registration trust, execution failure, ambiguous recovery, proxy spoofing, rate limits, worker restart, migrations, exports, health, and no signing in production.

## Studio Mode
Use https://studio.genlayer.com/contracts in the browser. Verify actual network/chain, stable authorized account, balance, fees, final artifact, constructor parameters. Obtain exact deployment approval; do not request/print seed/private key. Funding/faucet requires authorized legitimate flow; do not invent faucet availability or reuse compromised accounts.

Deploy through Studio UI only. Record artifact hash, address, deployment hash, environment, policy, validator/model configuration. Inspect real web/LLM/equivalence execution and consensus evidence. Distinguish configured/simulated Studio validators from independent public-network operators. Never claim stronger decentralization than observed.

Test live: shared origin, distinct evidence, missing origin, mixed-origin article, common injection, partial/liveness recovery, successful finalization, controlled execution failure. An approved isolated test deployment with residual risk is not public-release certification.

Every contract change invalidates prior deployment certification: new hash, specific approval, Studio redeployment, configuration update and affected live retests. No code revision is certified by an old address.

## UI-only acceptance
Live writes must be initiated through visible UI controls: Studio for deployment, EchoTrace for case operations. No CLI/script/curl/raw-RPC/DevTools/page.evaluate write shortcut. Browser automation may click/type; internal app GenLayerJS calls are normal. Terminal remains allowed for local tests/diagnostics/read-only inspection/fixture preparation. Mock unit tests are not live writes.

Journey:
landing -> app -> RainbowKit wallet -> draft -> preflight -> manifest confirmation -> user signature -> create_case -> source review -> seal -> relationship review -> finalize -> direct contract reads -> compare database/UI/contract.

If an action lacks a frontend control, implement it. Do not prefill live cases via scripts. User approval is required for each consequential wallet action; never bypass the wallet. After auth/funding/signature blocker, preserve exact pending step and continue independent work.

QA paths: signature denial, insufficient funds, wrong network/account, refresh/pause/resume, submitted hash registration failure, unknown broadcast, stale indexer, worker restart, RPC disruption, partial result banner, third-party attempt rejection with a second authorized test wallet, graph/list/collapse/gaps/removal, share/export, docs/roadmap.

Verify all public views through Studio and relevant app controls: valid/missing/partial/finalized cases, invalid identifiers, unavailable evidence, empty collections, fixed policy. Reads generally do not create transaction hashes; report inputs/results/assertions instead.

## Browser QA
Use Playwright Test plus available official CLI/MCP/skill integration. Production build, Chromium/Firefox/WebKit, desktop/tablet/mobile; DOM/user-centered assertions, console/network inspection, redacted traces/screenshots. Distinguish mocked wallet, real desktop wallet, and real mobile wallet coverage. No test-only success hooks in production.

Use condition-based waits, not arbitrary sleeps/networkidle when persistent connections make it unsuitable. Raising a test timeout requires measured cause, not hiding UI unresponsiveness. Required skipped cases remain gaps; intentional browser-specific skips require documented equivalent coverage.

Automated accessibility checks plus keyboard/manual visual checks and available screen reader. Do not claim manual behavior tested when only CSS or a mock was inspected.

## Root-cause loop
Maintain docs/checkpoint.md, acceptance-matrix.md, security-findings.md, and release-verification.md.
Pick highest-impact incomplete gate -> reproduce -> diagnose -> smallest robust fix -> regression test -> focused verification -> record evidence -> continue. Broaden tests for shared/risky changes and convergence. Do not repeatedly rerun unchanged suites or invent new scope to avoid shipping.

Use Ponytail review on significant diffs and a final repo audit; fix meaningful issues. Independent QA/design/security tasks may run in parallel if tools support them, but one owner integrates results and prevents conflicting edits.

After repeated failure, change the diagnostic strategy. Real external blockers are not solved by blind retries, fake credentials, weakened assertions, or silently replacing Studio with mocks. Pause only dependent action and keep other work moving. Resume after compaction from checkpoint; do not reread/regenerate the whole pack on every edit.

## Documentation/open source
README, selected legitimate LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, .env.example, compact AGENTS, API/config/setup/operations/migrations/deployment/rollback/testing/contract policy/threat model/limitations/roadmap documents. Respect third-party licenses. Roadmap marks shipped/in progress/planned honestly. Do not publish repo, push, release, or deploy production without approval.

Security findings: severity, exact location, reproduction, impact, fix, regression evidence, residual risk. Internal review is not external audit or guaranteed TomeVault Gold tier. No guarantee that judges will find no defect; provide reviewable evidence instead.

## Definition of done
All mandatory product behavior implemented; local build/type/tests/Direct green; final-artifact Studio integration green; real wallet flow green; public-read matrix verified; UI/DB/contract agree; safe liveness; no unresolved known Critical/High security finding; expected accessibility/design QA; docs/config/secret hygiene.

Cannot claim zero bugs or universal semantic certainty. A self-rating never overrides a failed gate. Missing verification is PARTIAL/BLOCKED, not COMPLETE. Completion is finite within v1 scope; broader feature ideas go to roadmap.

## Final Persian report
1. COMPLETE / PARTIAL / BLOCKED and exact basis.
2. Implemented features and reuse/rebuild decisions.
3. Pinned versions/environment and actual network/validator context.
4. Final contract address and artifact SHA-256.
5. Deployment transaction hash.
6. Write table: scenario, visible UI action, method, hash, consensus status, execution result, state assertion.
7. Every read: method, arguments, expected, actual, assertion (no invented hash).
8. Full frontend-only journey evidence and reconciliation.
9. Direct, backend, build, browser, Studio results with counts and skipped gaps.
10. Security findings, fixes, remaining risks.
11. Accessibility/performance/design evidence and conditions.
12. Frontend score 1–10 with hierarchy/typography/responsiveness/accessibility/wallet recovery rubric.
13. Backend score 1–10 with correctness/security/idempotency/recovery/observability/maintainability rubric.
14. Optional contract assessment with integrity/live verification evidence.
15. Evidence locations and reproducible run/test instructions.
16. Exact external action still needed, if any.

Use N/A instead of fabricated values. Keep final report concise, with detailed artifacts in docs.
