# Backend, configuration, and operational specification

## Practical architecture
Use readable typed modules. Default: Next.js/TypeScript web/API; independent read-only worker; PostgreSQL; Redis/BullMQ; typed schemas; small GenLayerJS adapter; graph/report projection.

Do not add microservices or abstractions without need. Provide a local artifact store that works out of the box, with an S3-compatible implementation configurable for deployment. Missing S3 credentials must not force a fake deployment claim or block unrelated local QA.

The backend prepares, authorizes off-chain access, monitors, archives, and indexes. It never holds a production blockchain signing key. All live writes originate in the user wallet through the app. Session signing secrets are different from blockchain signing keys.

## Configuration
Create documented .env.example, valid local .env, typed config validation, and a setup/config-check command. Never overwrite an existing env silently or print values.

Generate secure local-only application/session secrets. Configure valid local DB/Redis/artifact defaults. External WalletConnect/RPC/account/storage values must be supplied legitimately or clearly unconfigured. Do not fabricate credentials or contract addresses.

Read deployment-sensitive settings from env: origins, ports, DB/Redis, storage, network/chain, RPC, explorer URL, contract addresses, quotas/concurrency/timeouts, allowed-source policy, session configuration, operator auth, logs, and test/Studio settings.

Only intentionally public values use NEXT_PUBLIC_. Explain build-time vs runtime values. Validate server/browser address and network consistency. Production deployment mode fails on missing required settings; explicitly labeled demo mode cannot write.

Contracts do not inherit backend env. Pass validated parameters through deployment and freeze per-case policy.

Gitignore all real env, credentials, wallet/keystore artifacts, auth storage, private traces, DB files. Restrict permissions. Never copy old Hermes env/accounts. Retire previously exposed test keys; never fund them. Rotate exposed local credentials through a coordinated safe plan if they are encountered. Do not touch other projects or shared credentials without understanding dependencies.

## User and team needs
- Draft creation/edit/preflight/recovery, bounded schemas.
- Real signed-session verification with nonce, expiry, domain/network context, replay protection.
- Atomic draft quotas enforced in DB, tested under concurrent requests.
- Server-side logout revocation; old token replay rejected.
- Per-user and per-IP controls plus global resource bounds as appropriate.
- Operator authorization and safe job/status diagnostics.
- Structured redacted logs with correlation IDs.
- Health/readiness tested against real DB/Redis.
- Predictable timeouts, bounded polling/concurrency/retries, graceful shutdown.
- Database migrations all ordered/tracked, backup/restore and rollback docs.
- Safe exports and artifact access; no path traversal or private registry leakage.

Trust forwarded headers only under a verified proxy topology: proxy sanitizes/overwrites them and direct untrusted access cannot bypass it. TRUST_PROXY=true alone is not proof. Do not solve anonymous bucket collisions by trusting spoofed IP headers.

## Transaction registration and recovery
A client-supplied hash is untrusted. Pending registration may exist, but success requires network verification: target network/contract, method/operation, sender, execution, and relevant state. Test nonexistent, wrong-network/contract/method/sender, and failed hashes.

Protect session-private registry metadata. Rate-limit both cached status and explicit chain-refresh endpoints. Label their difference and timestamps accurately.

Persist hash/request identity before monitoring and preserve it if backend registration fails. Retry registration, not the wallet write. No production test hooks/window globals may inject success. Production builds must exclude test bypasses and mocked signing.

Known hash -> reconcile the same transaction.
Possible broadcast without hash -> investigation and idempotent recovery, not user-assertion-only reset.

Use network + contract address + case ID, and network + tx hash, consistently. Reconcile database from finalized contract state, not leader guesses. Final reports never originate solely from off-chain suggestions.

## Worker
Jobs for preparation/indexing/artifacts/receipts only; no signing/submission. Idempotent upserts, backoff, dead-letter handling, restart recovery, bounded RPC usage. A process failure/receipt timeout must not silently fabricate state or duplicate writes.

Test transient failures, delayed indexing, cache mismatch, wrong case association, concurrency, startup/readiness, and refresh/restart recovery with real services.

## API outline
POST /api/drafts
GET /api/drafts/:id (owner authorized)
POST /api/drafts/:id/preflight
POST /api/transactions/register
GET /api/tx?hash=...
POST /api/transactions/:hash/refresh (authenticated/rate limited)
GET /api/cases/:id
GET /api/cases/:id/report
GET /api/cases/:id/export

Adjust names consistently; document actual contracts. A browser refresh button must honestly state whether it requests chain data or merely reloads the index.

## Local infrastructure
Provide reproducible setup with stable mounts/volumes, pinned versions/checksums and safe diagnostics. Direct contract tests do not require Docker. Docker may be optional infrastructure for DB/Redis/local Studio, not a prerequisite hidden inside Direct Mode.

If Ollama/local Studio is used, persist models in a volume, expose APIs safely, verify cold/warm behavior and timeout alignment, and avoid destructive recreation without backup. Prefer hosted Studio acceptance rather than rebuilding an unrelated local consensus stack unnecessarily.
