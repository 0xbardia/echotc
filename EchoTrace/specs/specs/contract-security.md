# Contract, integrity, and transaction specification

## Compatibility gate
Verify installed Python SDK, GenLayerJS, genlayer-test, network, fees, storage types, and VM APIs against official documentation/examples. Pin versions. Use a minimal Python/VM vertical slice early.

Mandatory: Python gl.Contract; preserve valid SDK-generated # Depends at file top; VM web retrieval through gl.nondet.web.render; meaningful gl.eq_principle for nondeterministic decisions, preferably supported criteria-based patterns such as prompt_comparative. Do not invent APIs or silently replace mandatory APIs with old ones. If compatible tooling is unavailable, report the concrete prerequisite.

No requests/httpx/urllib or external HTTP clients for authoritative retrieval inside the contract. Backend preflight is untrusted preparation, not the authoritative evidence source.

## State
CREATED -> SOURCE_REVIEW -> RELATIONSHIP_REVIEW -> FINALIZED.
Use explicit item statuses and safe terminal partial/abandoned status if the approved design requires it. Do not silently treat pending items as reviewed.

Methods, proposed logical interface:
create_case(manifest)
review_sources_batch(case_id, batch_id)
seal_source_reviews(case_id)
review_relationship_batch(case_id, batch_id)
finalize_case(case_id)
get_case(case_id)
get_source_review(case_id, source_id)
get_relationships(case_id)
get_report(case_id)
get_policy_version()
get_policy()
get_case_count()

Verify every actual public view, including any additional exposed views, on the final deployment.

## Deterministic invariants
- Manifest and per-case policy cannot change.
- Input/output/batch/content bounds are enforced.
- IDs and reference directions are valid.
- Parent case exists or is empty.
- Submitted/discovered caps are enforced.
- No global finite case cap creating permanent denial of service.
- Processing state mutations are restricted to that case creator in v1; reads are public.
- Unauthorized users cannot consume attempts, seal, finalize, replace evidence, or exhaust another case.
- Accepted evidence cannot be overwritten.
- Relationship schedule/coverage is derived from frozen state, not caller-selected omissions.
- No incomplete ordinary finalization.
- Partial finalization is explicitly marked and allowed only by the documented policy.
- No caller-selected final verdict can enter state directly.
- Duplicate calls are safely idempotent or clearly rejected.

## Idempotent creation
Implement a contract-enforced key bound to sender and clientRequestId. Same sender/key/manifest returns the existing case or a deterministic duplicate outcome without creating a second case. Same key with different manifest is rejected. Persist the request ID before wallet prompting. Verify digest/serialization and collision/replay assumptions. UI and backend must reconcile ambiguous sends without guessing that broadcast did not occur.

## Evidence acceptance
Retrieve and check relevant evidence independently according to the actual equivalence API. Do not blindly accept a leader's proposal or rely on identical free-form JSON.

Quotes must be anchored against observed rendered text with explicit bounded normalization. Validate presence, relevant context, claim relation, attribution, time, modality, supporting IDs, and dependency direction. A quote can be real yet unrelated or insufficient.

Different renderings of ads/navigation need not reject a case; changes to relevant evidence must not be ignored. Record truncation and coverage limits. A snapshot/content hash is not cryptographic proof of publisher authenticity. Keep these claims precise.

Semantic checks must include negotiation vs confirmed partnership, announcement vs occurrence, probabilistic vs factual assertion, stale evidence, third-party attribution, contradictions, and mixed-origin articles. Heuristics are supplemental, not universal semantic proof. Use unclear/unresolved when support is insufficient.

## Liveness
Design and document safe bounded retries/recovery before final deployment. Distinguish source unavailable, unknown provenance, invalid accepted output, provider error, and failed consensus/transaction rejection.

Never rely on a counter written in a transaction that ultimately reverts. Do not trust client-reported attempts. Do not swallow equivalence failure to fabricate an accepted record. Only authenticated case processing can advance retries. Legitimate recorded failures can reach explicit unavailable/rejected/failed item status, not reviewed. Unknowns are not fabricated successes.

A transaction never accepted cannot be assumed to mutate state. Test actual gl.vm.UserError/error boundaries in the real VM. If safe recovery requires cancellation/reanalysis, document it and keep partial results honest. Do not remove safety guards merely to finalize.

## SSRF and resource safety
Validate claim and URL policy before nondeterministic execution. Retrieve within the VM, then bound/normalize external content before LLM input. Bound accepted results before state writes.

Verify actual renderer/runtime protections against private/reserved addresses, credentials, dangerous ports/schemes, redirect bypasses, DNS rebinding, oversized responses, and unbounded duration. Application hostname checks are not complete runtime protection. Backend checks do not protect direct contract callers.

Use controlled authorized fixtures only. Prefer enforceable egress protections and/or a defensible restricted-source policy. Do not claim DNS safety from a hostname allowlist alone. If runtime risk cannot be closed, keep public release blocked and report it accurately. An explicitly approved controlled test deployment is not public-release certification.

## Prompt injection
All user text, page text, metadata, references, and backend proposals are untrusted. Consensus agreement does not establish immunity: every validator may see the same manipulation.

Enforce fixed policy, bounded schemas, IDs/reference integrity, quote grounding, allowed transitions, and conservative verdicts. External content cannot modify policy, permissions, sources, execution actions, or output schema.

Fixtures: fake system/developer/validator instructions, hidden HTML/metadata directives, multilingual/Unicode injection, fabricated quotes inside valid JSON, invented sources, wrong directions, common injection across all validators, truncation hiding attribution, and unsupported conclusions using a real quote.

Do not claim a prompt-only defense guarantees semantics. Report meaningful observed outcomes and limitations.

## Receipt correctness
Separate consensus lifecycle, execution result, and app outcome. According to documented GenLayer receipt semantics, success requires an accepted/finalized lifecycle and successful execution such as FINISHED_WITH_RETURN; verify the exact installed SDK mapping. Final application success requires finalization and expected state.

FINALIZED with execution failure is not success. Missing/unknown execution result is unresolved, not success. Never advance the queue or create case IDs from a failed receipt. Map numeric/string statuses with versioned tests. Monitor ambiguous/submitted_unconfirmed. Cancellation/timeouts/undetermined must not remain silently pending forever.

A local deadline means overdue/needs review, not proof of chain failure. Appeal is not mandatory v1 functionality unless actually implemented; unresolved cases need truthful recovery guidance.
