# EchoTrace v1 — App Builder execution pack

This is an instruction/specification pack, not the application and not a deployment certificate.

Attach the ZIP to App Builder with access to a writable repository/runtime. Start with START_PROMPT.md. Keep the other documents available for task-specific reading. The agent must verify its actual Python, browser, wallet, worker, and deployment capabilities before promising completion.

Default: create an isolated new workspace for the App Builder. Preserve the Hermes repository and all other projects. Reuse useful nonsecret source/fixtures only after inspection. Do not copy old .env, keys, sessions, or deployment evidence. If the user explicitly selects the existing repository, work on a separate branch/worktree instead of destroying history.

Files:
- START_PROMPT.md: the initial instruction.
- AGENTS.template.md: compact project invariants; reconcile with actual repository instructions.
- specs/product.md: the bounded product and data model.
- specs/contract-security.md: contract, trust boundaries, liveness, transaction correctness.
- specs/backend.md: services, configuration, recovery, and operations.
- specs/frontend.md: liquid-glass design and product behavior.
- specs/verification.md: local/live/browser gates and reporting.
- RESUME_PROMPT.md: continue after compaction or interruption.

No file authorizes external deployment, wallet approval, publication, funding, or deletion. Obtain specific authorization at the actual action boundary. Local disposable engineering is pre-authorized.
