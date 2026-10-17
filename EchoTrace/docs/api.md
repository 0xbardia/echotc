# API

Policy `echotrace-policy-1.0.0`. Reads do not create a transaction hash. Writes are owner-only and one method per signature.

| Method | Kind | Arguments | Result |
| --- | --- | --- | --- |
| get_policy_version | view | none | `echotrace-policy-1.0.0` |
| get_policy | view | none | Caps, partial-finalization rule, and the non-certification text |
| get_case_count | view | none | Cases created on this contract, not a user count |
| get_case | view | case id | Owner, status, frozen manifest. Unknown id returns `found: false` and does not revert. |
| get_source_review | view | case id, source id | One review. Unknown source returns `found: false` and `fetchStatus: absent`. |
| get_relationships | view | case id | `{found, relationships}`. A missing case returns found false, not a bare empty list. |
| get_report | view | case id | A sealed report includes `finalized: true`. Before finalize the read still succeeds with `finalized: false` and does not invent evidence. |
| create_case | write | manifest JSON | Idempotent on sender plus clientRequestId |
| review_sources_batch | write | case id, batch id | Up to three pending sources. A repeated batch id is a no-op. |
| retry_unavailable | write | case id | One more attempt, cap 2. Unavailable may stay unavailable. |
| seal_source_reviews | write | case id | Closes review and derives relationships from stored contributions |
| review_relationship_batch | write | case id, batch id | Marks coverage reviewed. It does not reclassify. |
| finalize_case | write | case id | Refuses a case with no reviewed source. Partial stays partial. |

Contract `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B`. Deployment `0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30`.

On that deployment, a review stores an anchored sentence from the rendered page. It does not store a model-written origin URL, because free-form origin labels split validator consensus. Origin gaps are shown in Direct Mode when a labeled fixture cites a URL that was not frozen.

Direct Mode is a separate ledger in the browser. A local read is not a Studionet read.
