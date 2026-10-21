# EchoTc Live Acceptance Evidence & Final Verification

Authoritative reference for candidate `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319` on GenLayer Studionet (Chain ID 61999).

## 1. Candidate Deployment & Source Provenance

- **Contract Address:** `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319`
- **Deployment Transaction:** `0xae2d2c64ea7b7670996c70e117248b6b471d00977446e4481de54fa43240aac2`
- **Deployment Status:** `FINALIZED / SUCCESS`
- **Source File:** `EchoTrace/contracts/echotrace.py`
- **Source SHA-256:** `ccc59986e57bb5ef8570d87fdd4d5943f4de8eb50257d9ae5c6ed168a5aca616`
- **Application Build Commit:** `a735a6f2a89c38ec7005b72c3ee96719e7196a69`

## 2. Release Tag `v1.0.0` Identity

- **Tag Type:** Annotated tag object
- **Tag Object SHA:** `728fd688b67d2300d8340d4c2aaaaffc5e6f83f8`
- **Peeled Commit SHA:** `cb8abef0a36d55a557ed5e938475ffa3d725f84a` (`refs/tags/v1.0.0^{commit}`)
- **Remote Ref Matching:** Exact match confirmed on `origin` without modification.

## 3. Real MetaMask Acceptance Case: `et-c3a20529e6a1`

- **Owner:** `0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA`
- **Client Request ID:** `req-repaired-mm-mvhfpo8o`
- **Canonical Manifest Digest (SHA-256):** `1c96863679c950cf3460444563363fa35c6e11178f198214c9522c6d66b66614`
- **Canonical Byte String:**
  `{"claim":"The domain names example.com, example.net, and example.org are reserved for documentation purposes.","clientRequestId":"req-repaired-mm-mvhfpo8o","language":"en","parentCaseId":null,"policyVersion":"echotrace-policy-1.0.0","sources":[{"id":"src-1","parentSourceId":null,"role":"submitted","url":"https://www.iana.org/domains/reserved"},{"id":"src-2","parentSourceId":null,"role":"submitted","url":"https://en.wikipedia.org/wiki/Example.com"},{"id":"src-3","parentSourceId":null,"role":"submitted","url":"https://httpbin.org/html"}]}`

### Sequential 5-Step Consensus Execution Ledger

| Step | Method                      | Transaction Hash                                                     | Status    | Execution Result |
| ---- | --------------------------- | -------------------------------------------------------------------- | --------- | ---------------- |
| 1    | `create_case`               | `0x6fd794326e69ef0602490f4ad0ecfe701add4ec0c218146bd9bd00fbc529aa33` | FINALIZED | SUCCESS          |
| 2    | `review_sources_batch`      | `0xe3b751b63f3250e812b208e971633bb6ecaa368eb2b05532163c886418730d74` | FINALIZED | SUCCESS          |
| 3    | `seal_source_reviews`       | `0x4e5883aa3a85b43520c8cb57b996603983064b256b5f70f952a56942cb1e442c` | FINALIZED | SUCCESS          |
| 4    | `review_relationship_batch` | `0x8f2a08d91fe890510ca5e41e9a7349bd0488eb600ca3ab7f16b6a6f54e46ddcf` | FINALIZED | SUCCESS          |
| 5    | `finalize_case`             | `0xa0b09b85c1f0477b0342b327c1efab2ca4f2374db6b3f6b841ec0ce24e95935d` | FINALIZED | SUCCESS          |

## 4. Stored Semantic Outcomes & Quote Verification

| Source ID | URL                                         | Stance              | Exact Stored Quote                                                                                                                                                                             | Length | Stored Offset | Offset Verification Scope                                                                    |
| --------- | ------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------- | -------------------------------------------------------------------------------------------- |
| `src-1`   | `https://www.iana.org/domains/reserved`     | `primary_reporting` | `"As described in RFC 2606 and RFC 6761, a number of domains such as example.com and example.org are maintained for documentation purposes."`                                                  | 137    | 188           | Reported by the accepted execution output; original-text offset not independently rechecked. |
| `src-2`   | `https://en.wikipedia.org/wiki/Example.com` | `attributed_source` | `"They are reserved by the Internet Assigned Numbers Authority (IANA) at the direction of the Internet Engineering Task Force (IETF) as special-use domain names for documentation purposes."` | 186    | 872           | Reported by the accepted execution output; original-text offset not independently rechecked. |
| `src-3`   | `https://httpbin.org/html`                  | `unrelated`         | `""`                                                                                                                                                                                           | 0      | -1            | Not applicable; stance is unrelated with empty contributions.                                |

### Relationships

- `rel-1`: `src-1` -> `type: primary_evidence`, `status: reviewed`, explanation `"Anchored sentence (primary_reporting at offset 188). Not a truth verdict."`
- `rel-2`: `src-2` -> `type: distinct_evidence_shown`, `status: reviewed`, explanation `"Anchored sentence (attributed_source at offset 872). Not a truth verdict."`

### Final Report Metrics

- `complete`: `true`
- `partial`: `false`
- `sourcesReviewed`: 3
- `sourcesUnavailable`: 0
- `sourcesFailed`: 0
- `primarySources`: 1
- `attributedSources`: 1
- `mentionsSources`: 0
- `unrelatedSources`: 1
- `unclearSources`: 0
- `relationshipCoverage`: `"2/2"`
- `unresolved`: `[]`

## 5. Resource & Funding Reconciliation

- **Candidate Deployments:** 2 used (`0x2d6B3bF61E492a4d1781da878DB6B5563baf9aF5`, `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319`).
- **QA Cases:** 2 used (`et-8f0fed3e597d`, `et-c3a20529e6a1`).
- **Total Submitted Transactions:** 9 submitted against ceiling of 20.
- **Funding Note:** Native on-chain transfer of 5 testnet GEN via transaction `0x3821687fc939ce1c1ee714d25b618d4bc8a13e2dd0e3704d68f958ff3fc9ec02` from `0x1BD6Eabf3fE310822835F678396c83b7e5EA859B` to `0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA`. Recorded as a technical deviation necessary to unblock MetaMask v13 confirmation button suppression.
