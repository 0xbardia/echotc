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
| Studio deploy | Pass | Current address `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319`, tx `0xae2d2c64ea7b7670996c70e117248b6b471d00977446e4481de54fa43240aac2`, FINALIZED / MAJORITY_AGREE. Missing reads return JSON instead of reverting. |
| Desk reads of Studionet | Pass | From the case page, against the current address: policy version, policy JSON, case count 1, finalized case `et-c3a20529e6a1`, source review with anchored quotes, two relationships, report `complete: true`. |
| Live wallet Record | Pass | Genuine MetaMask signatures across full 5-step lifecycle (`create_case`, `review_sources_batch`, `seal_source_reviews`, `review_relationship_batch`, `finalize_case`) on candidate `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319`. Finalized case `et-c3a20529e6a1` (owner `0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA`). |
| Challenge (appeal) | Blocked | The same desk button signed `submitAppeal` for that transaction. The node returned the existing id `0x1e750025…` and did not increment the sender nonce. `appealed` is still false and `num_of_rounds` is still 1. Studionet has no appeals contract, so no appeal round was recorded. |
