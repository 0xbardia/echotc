# Product specification

## Outcome
EchoTrace reviews claim-specific evidence provenance. A user submits one exact claim and 3–8 public URLs. The app shows which sources depend on a shared observed origin, what distinct evidence is documented, and what remains unknown. It does not equate article count with independent witnesses or certify the claim as true.

Headline: Eight articles. How many actual witnesses?
One-line description: EchoTrace maps claim-specific evidence provenance, revealing when multiple articles rely on the same underlying source.

## v1 scope
- English analysis; localization-ready UI architecture.
- One explicitly confirmed claim, proposed maximum 500 characters.
- 3–8 submitted URLs, at most 12 total manifest sources.
- One-hop relevant reference discovery before manifest confirmation.
- Public readable text sources only; no private cookies/credentials.
- Freeze sources, claim, policy, and configuration context at creation.
- User wallet owns processing authorization for its cases. Public reads remain public.
- Suggested source/batch limits are tested and tuned against the actual VM, with security bounds authoritative in the contract.
- No token, staking, general web crawler, publisher reputation blacklist, image/video judgment, or fake independence percentage.

## Claim precision
Suggested clarification is allowed, but the user must approve it. Never silently transform “partnership occurred” into “one party announced a partnership.” Preserve modality, attribution, timeframe, and scope.

## Data entities
CaseManifest: claim, language, sources{id,url,role,parentSourceId}, policyVersion, clientRequestId, optional parentCaseId.
SourceReview: sourceId, fetch/processing status, stance, evidence contributions, attempts where applicable, coverage/limitations.
EvidenceContribution: id, sourceId, exact anchored quote, evidence kind, referenced origin URL/description, explanation.
Relationship: evidence/source references, direction, type, supporting evidence IDs, explanation, processing status.
Report: complete, sources reviewed/unavailable/rejected, relationship coverage, observed evidence families, unresolved items, limitations, contract/policy identity.

An article can contribute more than one origin. The graph must not erase an additional interview because the article also quotes a press release.

Stance: supports / contradicts / mentions_only / unclear.
Relationships: explicit_dependency / possible_dependency / distinct_evidence_shown / unresolved.
Processing failures must not masquerade as relationship verdicts.

## Required user flow
Landing -> enter app -> RainbowKit connection -> draft -> preflight -> manifest confirmation -> user signature -> create_case -> source review -> seal -> relationship review -> finalize -> direct reads -> share/export.

The UI presents a resumable action queue. Every requested transaction is explained and individually authorized. Do not claim an initial signature grants unsupported authority over later writes. Estimate remaining approvals from the actual action plan and label estimates/retries.

## Required features
- Draft creation, authorized recovery, dashboard history.
- Source-level evidence cards.
- Directed evidence graph and accessible list with identical relationships.
- Collapse View: visually group documented shared origins.
- Origin Gap: referenced but unreviewed origin explicitly labeled.
- Removal Impact: recompute displayed support from registered evidence, without a fresh invented verdict.
- Exact claim and policy display.
- Partial-analysis banner and complete flag.
- Direct contract reads with provenance/timestamp distinct from index fallback.
- JSON export, safe share links, reanalysis as a new case linked to its parent.
- Correct loading/empty/error/ambiguous/final states.

Never call a historical first-observed page the original source of the Internet. Never infer independence from different wording, authors, or domains. No evidence remaining after a filter means only none in the reviewed set, not that the claim is false.

## Routing
/, /app, /app/new, /cases/[id], /roadmap, /docs.
An authenticated operations interface or documented secure CLI is acceptable. A public unprotected admin route is not.

## Completion
A deployed, user-wallet-driven case must reach finalization with real reviewed evidence. Contract, database, and UI agree. Mock demonstrations remain clearly labeled and do not constitute delivery.
