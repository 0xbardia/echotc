# EchoTc

EchoTc is an evidence-provenance desk, not a truth judge.

Input: one claim and 3–8 public URLs.
EchoTc traces source citations, reveals when multiple secondary reports collapse into a single corporate wire release or primary witness, and surfaces unreviewed cited documents as explicit **Origin Gaps**.

It does not emit true/false verdicts, certify factual claims, or authenticate off-chain publishers. Incomplete reports remain visibly incomplete.

---

## Operating Modes

1. **Direct Mode (Browser Ledger)**
   - Local TypeScript evaluation engine in the browser.
   - Persistence stored in `localStorage` under key `echotc-ledger-v1` (with safe, backward-compatible migration from legacy key `echotrace-ledger-v1`).
   - Never invents simulated blockchain transaction hashes; receipts clearly mark that transactions were not submitted to consensus.
   - Deterministic sentence-anchoring: extracts sentences overlapping with the claim and verifies that quotes are strict substrings of rendered page content.

2. **Studionet Mode (GenLayer Intelligent Contract)**
   - Deployed on GenLayer Studionet (Chain ID `61999`, RPC `https://studio.genlayer.com/api`).
   - Contract Address: `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319`
   - Deployment Transaction: `0xae2d2c64ea7b7670996c70e117248b6b471d00977446e4481de54fa43240aac2`
   - Execution uses GenLayer consensus with non-deterministic web retrieval (`gl.nondet.web.render`) inside `gl.eq_principle.prompt_comparative`.
   - Polling interval: 12 seconds (`sleep(12000)` in `src/lib/echo/chain.client.ts`), preserving Studionet rate-limit compliance.

---

## Contract Implementation & Deployment Provenance

- **Deployed contract source SHA-256:** `ccc59986e57bb5ef8570d87fdd4d5943f4de8eb50257d9ae5c6ed168a5aca616`
- **Recorded deployment transaction:** `0xae2d2c64ea7b7670996c70e117248b6b471d00977446e4481de54fa43240aac2`
- **Verified on-chain case:** `et-c3a20529e6a1` (owner `0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA`, finalized with full 5-step consensus execution success).
- **Previous deployment (preserved for historical evidence):** `0x0BcE79508f7705412D6c6E83750D12547715DB53` (Tx: `0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30`).
- **Semantic Provenance Rules:**
  - Quotation anchoring strictly verified against rendered text (20–280 characters).
  - Categorization into `primary_reporting`, `attributed_source`, `mentions_only`, and `unrelated`.
  - Secondary reporting/encyclopedic citations naming external authorities map to `attributed_source`.
  - Unrelated web pages map to `unrelated` with empty contributions.

---

## Known Network & Protocol Limitations

1. **Challenge / Appeals:**
   Studionet does not currently support appeal rounds because the platform `appealsContract` is unavailable. Attempting to challenge an on-chain transaction returns `"No appeal round opened"`. This is a network platform constraint, not an application bug.

2. **DNS Rebinding:**
   Host validation inspects literal URLs, but does not prevent DNS rebinding attacks at validator fetch time.

3. **Quota & Rate Limits:**
   GenLayer Studio RPC enforces quota limits. The client enforces a 12-second polling interval to prevent request amplification.

---

## Prerequisites & Setup

### Environment Requirements
- Node.js >= 20.x (Node 22 LTS recommended)
- npm

### Installation
```bash
npm install
```

### Environment Variables
Copy `.env.example` to `.env` (optional, defaults are baked into the client):
```bash
cp .env.example .env
```
- `VITE_ECHO_CONTRACT_ADDRESS`: Optional override for the contract address (defaults to `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`).
- `VITE_WALLETCONNECT_PROJECT_ID`: Optional Reown/WalletConnect project ID for QR modal connectivity. Injected wallets work without it.

### Running Locally
```bash
npm run dev
```
Preview is served at `http://127.0.0.1:8080`.

### Building for Production
```bash
npm run build
```

### Running Tests
```bash
# Unit & integration tests
npm test

# Browser-based QA (deterministic offline suite)
npm run test:browser

# Optional: Browser QA including live Studionet read-only methods
npm run test:browser -- --live-reads

# Type checking
npm run typecheck

# Linting
npm run lint
```

---

## Architecture & Routes

- `/`: Editorial landing page with interactive evidence pile and contract transparency widget.
- `/docs`: Documentation on provenance policy, read methods, and protocol differences.
- `/roadmap`: Shipped, in-progress, and planned milestones.
- `/app`: Intake desk displaying stored local cases, case counts, and public contract reads.
- `/app/new`: Case intake form (claim + 3–8 URLs) with preflight validation.
- `/cases/$id`: Case review desk supporting Direct Mode approve/deny steps, on-chain step signing, and public contract reads.

---

## Repository & Issues

- Repository: [https://github.com/0xbardia/echotc](https://github.com/0xbardia/echotc)
- Issues: [https://github.com/0xbardia/echotc/issues](https://github.com/0xbardia/echotc/issues)

---

## License

EchoTc is licensed under the [Apache License, Version 2.0](LICENSE).
See the `LICENSE` file for the full license text.
