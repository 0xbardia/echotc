# Acceptance matrix

| Gate | State | Evidence |
| --- | --- | --- |
| Landing, docs, roadmap | Pass | Routes `/`, `/docs`, `/roadmap`. Mobile menu navigates and closes. No horizontal overflow. |
| Wallet shell | Pass | RainbowKit connects an injected account. That account submitted the Studionet case. |
| Direct Mode journey | Pass | Example case created only through visible controls, denial leaves CREATED, then finalized partial: 7 reviewed, 1 unavailable, origin gap kept. |
| Idempotent create_case | Pass | Engine test |
| Owner isolation | Pass | Engine test |
| Anchored quotes | Pass | Fixture quotes must occur in page text |
| Injection fixture | Pass | Instruction text is not stored as a command |
| Unknown host | Pass | Unavailable, no invented quote |
| Origin gap classification | Pass | Unread interview is unresolved, not explicit |
| Public reads on Direct Mode | Pass | All seven view methods from the case desk |
| Studio deploy | Pass | Current address `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`, tx `0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30`, FINALIZED / MAJORITY_AGREE. Missing reads return JSON instead of reverting. |
| Desk reads of Studionet | Pass | From the case page, against the current address: policy version, policy JSON, case count 1, finalized case `et-41f3646a7e1f`, source review with the anchored example.com sentence, three relationships, report `complete: true`. |
| Live wallet Record | Pass | Desk button Sign this step, account `0xC3B4187c4516E9C7c8Ec5725ed9B2a99b75495BD`. Transaction `0x1e7500252c83b47600aa351eae4605b7104c7263d52df214dd1f8e6ad41d63cf` is FINALIZED / MAJORITY_AGREE and created case `et-280db9fe766f` on `0x8EB48E25fAE1F8b997b58e27F756FD0A7E1FB5Ce`. |
| Challenge (appeal) | Blocked | The same desk button signed `submitAppeal` for that transaction. The node returned the existing id `0x1e750025…` and did not increment the sender nonce. `appealed` is still false and `num_of_rounds` is still 1. Studionet has no appeals contract, so no appeal round was recorded. |
