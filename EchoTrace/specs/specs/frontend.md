# Frontend and editorial liquid-glass design

## Visual outcome
Build a distinctive professional dApp, not a generic AI dashboard. Natural palette: warm ivory, readable deep ink, forest/leaf green, restrained terracotta/amber. No generic purple/blue neon, decorative AI orbs, fake credibility badges, or endless gradient cards.

Liquid glass: selective translucent surfaces, visible but restrained background layers, controlled blur, fine borders/depth, strong typographic hierarchy. Use solid high-contrast fallbacks. Glass is not a license for unreadable text or heavy GPU work.

Use licensed readable fonts with suitable fallbacks/local hosting where feasible. Consistent tokens, spacing, focus, icons, and states. Desktop, tablet, and mobile should feel designed, not merely compressed.

## Landing
- Precise product hero and CTA into actual app.
- Labeled realistic evidence-collapse example.
- How sources differ from witnesses.
- Workflow and GenLayer's actual role.
- Source collapse, origin gaps, and limitations.
- Audience/use cases.
- FAQ, documentation, roadmap, open-source entry.
- No fabricated live counts, partners, quotes, audit tiers, or deployment claims.

Demo data is labeled. An unconfigured contract is visible and writes are disabled. Broken placeholder links are not published as real URLs.

## Wallet and transaction UX
Use RainbowKit + compatible wagmi/viem/TanStack Query. Configure verified chain details. App writes use user wallet via supported genlayer-js integration; use an adapter. Verify compatibility rather than guessing provider APIs.

WalletConnect is supported when legitimately configured; injected wallets can be used for desktop pilot. Do not fabricate a project ID. Distinguish mobile viewport QA from real mobile wallet verification.

Show public/permanent notice, exact manifest, target network, operation, estimated fee, and realistic action/approval estimate before signing. Distinguish wallet prompt, broadcast, accepted, finalizing, execution failure, ambiguous, needs-review, and application success.

Do not reopen signature prompts automatically. User denial is not execution failure. Account/chain change invalidates the relevant action safely. Preserve progress on refresh and resume from chain/request identity. A timer cannot prove failure.

## Case UI
Show exact claim/policy, evidence quotes and origin relationships, coverage, unresolved items, source availability, processing failures, and complete flag.

Graph/list agree. Relationships show direction/uncertainty. Article can show multiple contributions. Labels remain visible; no overflow. Collapse and Removal Impact are derived from recorded evidence, not fresh fabricated judgments.

Read directly from contract when configured; index fallback is explicitly labeled and timestamped. Failed/missing direct read is not concealed as chain-verified data. Share/export match actual records.

## Accessibility/performance
Keyboard navigation, ARIA tab pattern, focus visibility, readable contrast on actual backgrounds, reduced motion, screen-reader check, reduced-transparency fallback. If emulation is unavailable, distinguish fallback unit tests from manual system-preference verification.

Accessible list alternative to canvas. Explain status in text, not color alone. Handle long URLs, errors, empty/loading states, small wallet labels, and partial analysis.

Security: escape external text, sanitize links, no raw article HTML, no unsafe URL schemes, no browser secrets/test success globals. Use version-appropriate CSP and security headers; evaluate nonce/hash approach where needed. Do not weaken production protections merely to remove console warnings.

Measure production-build performance with conditions; fix material regression. Do not invent Lighthouse scores or claim all accessibility criteria are proven by an automated scan.
