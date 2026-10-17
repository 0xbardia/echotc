# EchoTc (Contract & Documentation Pack)

EchoTc maps claim-specific evidence provenance. Eight articles can still be one witness. A case does not certify the claim.

The interactive desk is the application served from this repository root (landing, `/app`, `/app/new`, `/cases/:id`, `/docs`, `/roadmap`). This folder holds the contract, the copied specification pack, and the verification notes.

## Modes

- **Direct Mode** is the browser ledger. It always runs, even when a Studionet address is configured. Receipts say consensus was not submitted. No transaction hash is invented for a local step.
- **Studionet** writes go through RainbowKit and GenLayerJS, one method at a time, from the case desk. The server does not sign. The configured address is `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`. A desk read on 2026-10-15 showed `get_case_count` 0 and `get_relationships` returning `[]` for a missing id. The contract file in this repo is newer than that bytecode (`get_relationships` now returns `{found, relationships}`, and the URL filter is stricter). That file is not redeployed. Do not treat the address as proof of the current source.

## Contract

`contracts/echotrace.py` is a Python `gl.Contract`. Web retrieval sits inside `gl.eq_principle.prompt_comparative` and calls `gl.nondet.web.render`. Deploy it from the Studio contract UI. Do not treat a script deploy as acceptance.

See [docs/api.md](docs/api.md), [docs/deployment.md](docs/deployment.md), and [CHANGELOG.md](CHANGELOG.md).

Public views: `get_case`, `get_source_review`, `get_relationships`, `get_report`, `get_policy`, `get_policy_version`, `get_case_count`.

## Local checks

Engine tests live in `src/lib/echo/engine.test.ts`. They cover idempotent creation, owner isolation, anchored quotes, injection text, unknown hosts, and partial finalization.

## Configuration

See `.env.example`. Do not invent a WalletConnect project id or a contract address.
