# Checkpoint

Status: the Studionet case is finalized. Direct Mode and the chain are still different ledgers, and the desk says so.

Verified:
- Landing, docs, roadmap, sticky glass header, mobile menu closes after navigation, no horizontal overflow.
- Fonts: Source Sans 3 for text, Fraunces for display. Scrollbar is forest on ivory.
- Example Harborline case in Direct Mode stays partial on purpose: one source is unavailable and an origin gap is kept.
- Record, from the case desk Sign button: `0x1e7500252c83b47600aa351eae4605b7104c7263d52df214dd1f8e6ad41d63cf`, sender `0xC3B4187c4516E9C7c8Ec5725ed9B2a99b75495BD`, FINALIZED / MAJORITY_AGREE, case `et-280db9fe766f`.
- Challenge was signed from the same desk against that transaction. Studionet did not open a round: `appealed` remains false, sender nonce did not increase.
- Engine tests: chain-plan and the direct-mode suite passed.
- Contract `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`. Deployment `0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30`, FINALIZED / MAJORITY_AGREE. Views do not revert.
- Studio reads on the current address: all seven view methods return successfully. Unknown case, unknown source, and an unsealed report return `found` or `finalized` false. Earlier cases stay on `0x8EB48E25fAE1F8b997b58e27F756FD0A7E1FB5Ce`.

Not claimed:
- Studionet validators are the hosted studio set, not independent mainnet operators.
- A Direct Mode Harborline case is not the chain case. The ids differ.
