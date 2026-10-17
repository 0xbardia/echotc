# Known Issues and Release Blockers

## Release Blockers

1. **License Authorization:**
   - **Status:** RESOLVED (Apache-2.0 authorized by owner).
   - **Details:** The repository owner authorized Apache-2.0. The official license text is placed at `LICENSE` and `package.json` specifies `"Apache-2.0"`.
   - **Next Step:** Awaiting separate owner authorization for Git staging/commit and remote publishing.

2. **Secret File Exclusion:**
   - **Status:** RESOLVED LOCALLY / VERIFIED.
   - **Details:** Private test key file (`.echo-test-wallet.json`) was located in the working tree. Root `.gitignore` has been established to prevent tracking. The file was never tracked in git history (repository had no prior git commits).

## Documented Limitations & Non-Blockers

1. **Contract Source vs Deployed Bytecode Discrepancy:**
   - **Status:** DOCUMENTED.
   - **Details:** The local contract source (`EchoTrace/contracts/echotrace.py`, SHA-256 `f450f96f...`) differs from the deployed bytecode at `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B` (deploy artifact SHA-256 `8fcf378f...`).
   - Specifically, `get_relationships` on the deployed contract returns `[]` for missing cases, whereas the checked-in source returns `{"found": false, "relationships": []}`.
   - The frontend parser in `src/lib/echo/engine.ts` handles both formats seamlessly.
   - **Resolution:** Documented clearly in root `README.md`, `EchoTrace/docs/deployment.md`, and this file. Per instructions, redeployment is prohibited without proven bugs and owner approval.

2. **Studionet Appeal / Challenge Limitation:**
   - **Status:** PLATFORM LIMITATION.
   - **Details:** Studionet currently does not support appeal rounds because the platform `appealsContract` is unavailable. Challenging returns `"No appeal round opened"`. The application cleanly displays this notice without failing.

3. **RPC Rate Limits & Polling Interval:**
   - **Status:** MITIGATED.
   - **Details:** Studionet shared RPC endpoints have rate caps. `src/lib/echo/chain.client.ts` enforces 12-second polling (`sleep(12000)`) to remain safely within quota limits.

4. **DNS Rebinding & Source Fetching Analysis:**
   - **Status:** POTENTIAL PROTOCOL RISK (NON-BLOCKER).
   - **Code Paths:**
     - Direct Mode: Evaluates claims against local deterministic fixtures (`src/lib/echo/fixtures.ts`). No arbitrary outbound requests or SSRF exposure exist; DNS rebinding is **NOT APPLICABLE** to Direct Mode.
     - Studionet Mode: External web requests occur inside validator VMs via `gl.nondet.web.render` (`EchoTrace/contracts/echotrace.py:389`).
   - **Existing Protections:** Contract enforces strict syntax validation (`_public_url`), rejecting non-https schemes, credentials, ports, private/loopback IP literals, `.local`/`.internal` domains, and non-ASCII characters.
   - **Remaining Exposure:** If a malicious public domain resolves to a public IP during initial inspection but dynamically rebinds to an internal IP (e.g. `169.254.169.254`) during validator connection, Python contract code cannot detect the shift. This requires host-level IP filtering on validator nodes.
   - **Release Impact:** Non-blocker for frontend release. Acknowledged in the contract's own finalize output (`"Hostname checks do not close DNS rebinding."`).
