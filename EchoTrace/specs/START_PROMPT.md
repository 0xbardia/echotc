# Execute in App Builder

Build EchoTrace v1 end to end using this pack. This task is for App Builder, not Hermes. Implement runnable software; do not deliver only a plan, a frontend mock, or a scaffold.

Create an isolated workspace by default and preserve the prior Hermes repository. If I explicitly target the existing repository, use a separate branch/worktree and preserve unrelated changes. Reuse reviewed useful code rather than rebuilding it for novelty. Never copy old secrets, browser sessions, or certification evidence.

Read README.md and specs/product.md first. Inspect relevant repository instructions once. Use contract-security.md, backend.md, frontend.md, and verification.md when those tasks need them. Reconcile AGENTS.template.md into a concise project AGENTS.md without silently replacing higher-priority instructions. Keep detailed requirements in the specs, not in every prompt.

First verify your actual capabilities: writable filesystem, commands, Python contract SDK, genlayer-test, GenLayerJS, persistent services, browser tools, and user-assisted wallet/Studio access. Do not claim a website preview can substitute for a Python contract or backend. Prepare real portable implementation if hosting is constrained, and state the exact runtime needed.

Use official Spec Kit, Ponytail, and Playwright tooling with supported App integration. Verify installation and version; do not invent commands or claim skill execution that did not occur. Follow spec -> plan -> tasks -> implement -> converge, using proportional tests and progressive document loading.

Work autonomously on reversible local implementation, diagnostics, regression tests, browser QA, and repairs. Do not stop at first implementation. Continue through verified convergence. Request only material external credentials, account funding, authentication, wallet signatures, or consequential approvals; continue independent work while waiting.

Critical invariants:
- Python gl.Contract, valid # Depends, VM web rendering through gl.nondet.web.render, meaningful gl.eq_principle decisions.
- RainbowKit connection and user-wallet GenLayerJS writes; no production server signer.
- Authoritative provenance comes from contract validation, not backend suggestions.
- Frozen manifest, anchored evidence, conservative uncertainty, safe liveness, and protection against third-party attempt exhaustion.
- FINALIZED alone is not execution success.
- Safe ambiguous-transaction recovery and contract-enforced create_case idempotency.
- Liquid-glass editorial UI with natural colors and accessible solid fallbacks.
- Direct Mode and final-artifact Studio Mode are separate required gates.
- Real writes for acceptance only through Studio deployment UI or visible EchoTrace controls. No CLI/script/RPC/DevTools write shortcuts.
- No fabricated hashes, audit awards, test outcomes, scores, or completion claims.

Maintain an acceptance matrix and checkpoint. For each defect: reproduce, diagnose, make a minimal robust fix, add meaningful regression coverage, verify, record evidence, and continue. Run broad suites at integration milestones, not unchanged suites indefinitely.

After repairs, deploy the exact final artifact through Studio with specific approval. Then behave as a real Web3 user: landing -> wallet -> draft -> preflight -> confirmed manifest -> create_case -> source review -> relationship review -> finalize_case -> direct reads -> UI/database/contract reconciliation. If a control is missing, implement it; do not bypass the frontend. Verify every public read method and affected failure/recovery path. Redeploy and repeat affected evidence if the contract changes.

Finish only when verification.md gates pass or a precise external prerequisite genuinely prevents further authorized work. Preserve the resume point. Report PARTIAL/BLOCKED rather than manufacture PASS. The final Persian report must include real contract address, artifact/deploy hashes, write hashes, read assertions, live journey evidence, security findings, and justified frontend/backend scores.

Begin now with capability discovery and the smallest real vertical slice. Do not spend the first iteration polishing an unconnected landing.
