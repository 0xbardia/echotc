# Security findings

## Closed in this build

- An origin URL that is not in the frozen manifest is `unresolved`, not `explicit_dependency`, whatever the evidence kind.
- `retry_unavailable` stamps contribution ids. A retry can no longer store anonymous evidence.
- Numeric hosts in every dotted form (`127.1`, `127.0.0.1`, `8.8.8.8`), hex hosts, percent-encoding, backslashes, and non-ASCII hosts are rejected before render.
- A review stores an origin only when that https URL is inside the anchored sentence. Seal then marks it unresolved when the URL is not in the manifest. Model wording is not copied into the stored explanation.
- Free-form model explanations were stored in the review. Validators disagreed on that wording, the transaction ended UNDETERMINED, and the case never changed. The stored review is now the page sentence with the strongest overlap with the claim, plus fixed labels. The quote is still taken from the rendered page. The model is still called, and page instructions are not copied into the review.
- Private, loopback, credentialed, and non-https URLs are rejected before review.
- Another principal cannot advance a case or increment attempts.
- The same request id cannot create a second case, and cannot be reused with a different manifest.
- Chain write controls stay disabled without a configured address. There is no server signer.

## Open, not claimed as fixed

- Hostname filtering does not stop DNS rebinding or a renderer that follows redirects into a private network. That is a VM egress property. Direct Mode never fetches arbitrary URLs, which avoids the bug here and also means it is not a public web crawler.
- If two validators render different text for the same URL, the anchored sentence can still differ and the review can end UNDETERMINED. The case stays unchanged. That is disagreement, not a silent success.
- Browser Direct Mode storage is not tamper-proof. It is labeled as a local ledger. It must not be described as consensus.
- This review is internal. It is not an external audit.
