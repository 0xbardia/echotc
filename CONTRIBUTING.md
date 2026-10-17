# Contributing to EchoTc

Thank you for your interest in contributing to EchoTc.

## Code of Conduct & Contribution Principles

1. **Evidence Provenance, Not Truth Adjudication:**
   EchoTc maps citation relationships, quotes, and origin gaps. Do not add true/false verdicts or probabilistic truth scores. Incomplete investigations must remain visibly incomplete.

2. **Strict Verification:**
   Any changes to core engine logic (`src/lib/echo/engine.ts`) or policy (`src/lib/echo/policy.ts`) must be accompanied by automated deterministic tests verifying sentence anchoring and URL validation.

3. **No Unapproved Redeployments:**
   The deployed Studionet contract (`0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`) must not be redeployed or modified without explicit repository owner approval.

4. **Private Keys & Secrets:**
   Never commit private keys, wallet mnemonic phrases, testnet funds keys, or `.env` credential files. Ensure `.gitignore` rules remain intact.

## Development Workflow

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Verify changes locally:
   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   ```
5. Submit a pull request with an evidence-based summary of your changes.
