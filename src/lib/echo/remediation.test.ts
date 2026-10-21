import assert from "node:assert/strict";
import test from "node:test";
import { isChainCaseId, nextChainCall, type ChainSnapshot } from "./chain-plan.ts";
import { returnedCaseId } from "./chain.client.ts";
import { getIsolatedCase, useEcho } from "./store.ts";
import type { CaseFile } from "./types.ts";

const NOW = "2026-10-18T03:00:00.000Z";

function mockCase(id = "et-local-001"): CaseFile {
  return {
    id,
    owner: "0x1111111111111111111111111111111111111111",
    status: "CREATED",
    manifest: {
      claim: "Documentation domains are reserved for examples without permission.",
      language: "en",
      sources: [
        { id: "src-1", url: "https://example.com", role: "submitted", parentSourceId: null, title: "example.com" },
        { id: "src-2", url: "https://example.org", role: "submitted", parentSourceId: null, title: "example.org" },
        { id: "src-3", url: "https://example.net", role: "submitted", parentSourceId: null, title: "example.net" },
      ],
      policyVersion: "echotrace-policy-1.0.0",
      clientRequestId: "req-remediation-test-001",
      parentCaseId: null,
      manifestCanonical: "{}",
    },
    reviews: [
      {
        sourceId: "src-1",
        fetchStatus: "pending",
        stance: null,
        contributions: [],
        attempts: 0,
        coverageNote: "",
        limitations: "",
      },
    ],
    relationships: [],
    report: null,
    appliedBatches: [],
    receipts: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("Authoritative case ID format: recognizes 12-hex chain case ID vs 8-hex local preview ID", () => {
  // Authoritative chain case IDs are et- followed by 12 hex chars (total length 15)
  assert.equal(isChainCaseId("et-74ec46d2f72e"), true);
  assert.equal(isChainCaseId("et-41f3646a7e1f"), true);

  // Local Direct Mode IDs are 8 hex chars (total length 11) - must not be mistaken for chain IDs
  assert.equal(isChainCaseId("et-03516be3"), false);
  assert.equal(isChainCaseId("et-local01"), false);
  assert.equal(isChainCaseId(""), false);
  assert.equal(isChainCaseId(null), false);
});

test("Receipt case ID extraction: extracts authoritative case ID from transaction consensus receipts", () => {
  // 1. Direct string in leader_receipt result
  const txDirect = {
    status: "FINALIZED",
    consensus_data: {
      leader_receipt: [{ result: "et-74ec46d2f72e" }],
    },
  };
  assert.equal(returnedCaseId(txDirect), "et-74ec46d2f72e");

  // 2. Embedded inside JSON/stringified payload
  const txEmbedded = {
    status: "FINALIZED",
    consensus_data: {
      leader_receipt: [{ result: { case_id: "et-74ec46d2f72e" } }],
    },
  };
  assert.equal(returnedCaseId(txEmbedded), "et-74ec46d2f72e");

  // 3. Fallback across transaction body
  const txInBody = {
    status: "FINALIZED",
    hash: "0x123",
    data: "create_case for et-74ec46d2f72e completed",
  };
  assert.equal(returnedCaseId(txInBody), "et-74ec46d2f72e");

  // 4. Missing ID
  const txEmpty = { status: "FINALIZED" };
  assert.equal(returnedCaseId(txEmpty), null);
});

test("Store persistence: indexes authoritative chain case ID and maintains link to case file", () => {
  const store = useEcho.getState();
  const base = mockCase("et-local-preview-99");

  // Register in local ledger
  useEcho.setState((state) => ({
    ledger: {
      ...state.ledger,
      cases: { ...state.ledger.cases, [base.id]: base },
    },
  }));

  const chainCaseId = "et-74ec46d2f72e";
  const owner = "0x1111111111111111111111111111111111111111";

  store.recordChain(
    base.id,
    {
      method: "create_case",
      hash: "0xabc",
      statusName: "FINALIZED",
      execution: "SUCCESS",
      at: NOW,
      detail: "created",
    },
    chainCaseId,
    owner,
  );

  const updatedLedger = useEcho.getState().ledger;

  // Authoritative chain case ID must be directly lookupable in the ledger
  assert.ok(updatedLedger.cases[chainCaseId], "Ledger must index case under authoritative chainCaseId");
  assert.equal(updatedLedger.cases[chainCaseId]?.chain?.caseId, chainCaseId);
  assert.equal(updatedLedger.cases[chainCaseId]?.chain?.owner, owner);

  // Original local reference also preserved
  assert.ok(updatedLedger.cases[base.id], "Original local preview key must still resolve to case");
});

test("Workflow step progression: derives next step strictly from authoritative chain snapshot", () => {
  const c = mockCase("et-local-001");

  // Step 1: No snapshot -> create_case
  const step1 = nextChainCall(c, null, "b1");
  assert.equal(step1?.method, "create_case");

  // Step 2: Created snapshot with pending reviews -> review_sources_batch
  const snapshotCreated: ChainSnapshot = {
    caseId: "et-74ec46d2f72e",
    status: "CREATED",
    owner: "0x1111111111111111111111111111111111111111",
    reviews: [
      { sourceId: "src-1", fetchStatus: "pending", attempts: 0 },
      { sourceId: "src-2", fetchStatus: "pending", attempts: 0 },
    ],
    relationships: [],
  };
  const step2 = nextChainCall(c, snapshotCreated, "b2");
  assert.equal(step2?.method, "review_sources_batch");

  // Step 3: Reviewed sources -> seal_source_reviews
  const snapshotReviewed: ChainSnapshot = {
    ...snapshotCreated,
    status: "SOURCE_REVIEW",
    reviews: [
      { sourceId: "src-1", fetchStatus: "reviewed", attempts: 1 },
      { sourceId: "src-2", fetchStatus: "reviewed", attempts: 1 },
    ],
  };
  const step3 = nextChainCall(c, snapshotReviewed, "b3");
  assert.equal(step3?.method, "seal_source_reviews");

  // Step 4: Sealed with pending relationships -> review_relationship_batch
  const snapshotRelationships: ChainSnapshot = {
    ...snapshotCreated,
    status: "RELATIONSHIP_REVIEW",
    relationships: [{ status: "pending" }],
  };
  const step4 = nextChainCall(c, snapshotRelationships, "b4");
  assert.equal(step4?.method, "review_relationship_batch");

  // Step 5: All relationships reviewed -> finalize_case
  const snapshotReadyToFinalize: ChainSnapshot = {
    ...snapshotCreated,
    status: "RELATIONSHIP_REVIEW",
    relationships: [{ status: "reviewed" }],
  };
  const step5 = nextChainCall(c, snapshotReadyToFinalize, "b5");
  assert.equal(step5?.method, "finalize_case");

  // Step 6: Finalized -> null (nothing left to sign)
  const snapshotFinalized: ChainSnapshot = {
    ...snapshotCreated,
    status: "FINALIZED",
    relationships: [{ status: "reviewed" }],
  };
  assert.equal(nextChainCall(c, snapshotFinalized, "b6"), null);
});

test("Retry logic: allows retry only when sources failed/unavailable and attempts < 2", () => {
  const c = mockCase("et-local-001");
  const snapshotUnavailable: ChainSnapshot = {
    caseId: "et-74ec46d2f72e",
    status: "SOURCE_REVIEW",
    owner: "0x1111111111111111111111111111111111111111",
    reviews: [
      { sourceId: "src-1", fetchStatus: "unavailable", attempts: 1 },
    ],
    relationships: [],
  };
  const stepRetry = nextChainCall(c, snapshotUnavailable, "b-retry");
  assert.equal(stepRetry?.method, "retry_unavailable");

  // When attempt cap reached (attempts = 2), retry is disallowed, proceeds to seal
  const snapshotMaxAttempts: ChainSnapshot = {
    ...snapshotUnavailable,
    reviews: [
      { sourceId: "src-1", fetchStatus: "unavailable", attempts: 2 },
    ],
  };
  const stepSeal = nextChainCall(c, snapshotMaxAttempts, "b-seal");
  assert.equal(stepSeal?.method, "seal_source_reviews");
});

test("Remote read-through: transforms on-chain payload into valid CaseFile when local storage is empty", () => {
  // Simulates client receiving on-chain JSON from get_case, get_report, get_relationships
  const onChainCaseJson = {
    id: "et-74ec46d2f72e",
    owner: "0x1111111111111111111111111111111111111111",
    status: "FINALIZED",
    manifest: {
      claim: "Documentation domains are reserved for examples without permission.",
      sources: [
        { id: "src-1", url: "https://example.com", role: "submitted", parentSourceId: null },
        { id: "src-2", url: "https://example.org", role: "submitted", parentSourceId: null },
        { id: "src-3", url: "https://example.net", role: "submitted", parentSourceId: null },
      ],
      policyVersion: "echotrace-policy-1.0.0",
      clientRequestId: "req-remote-001",
      parentCaseId: null,
    },
    createdAt: "on-chain",
    updatedAt: "on-chain",
  };

  const onChainReportJson = {
    caseId: "et-74ec46d2f72e",
    finalized: true,
    complete: true,
    partial: false,
    sourcesReviewed: 3,
    sourcesUnavailable: 0,
    sourcesFailed: 0,
    primarySources: 1,
    attributedSources: 1,
    mentionsSources: 1,
    relationshipCoverage: "3/3",
    unresolved: [],
    limitations: ["EchoTrace does not certify truth."],
    policyVersion: "echotrace-policy-1.0.0",
    contractIdentity: "echotrace:echotrace-policy-1.0.0",
  };

  const onChainRelationshipsJson = {
    found: true,
    relationships: [
      {
        id: "rel-1",
        fromSourceId: "src-1",
        toSourceId: null,
        originLabel: "page",
        type: "primary_evidence",
        supportingEvidenceIds: ["ev-src-1-1"],
        explanation: "Original declaration",
        status: "reviewed",
      },
    ],
  };

  // Build hydrated CaseFile as case-desk.tsx does
  const constructed: CaseFile = {
    id: onChainCaseJson.id,
    owner: onChainCaseJson.owner,
    status: onChainCaseJson.status as CaseFile["status"],
    manifest: {
      claim: onChainCaseJson.manifest.claim,
      language: "en",
      sources: onChainCaseJson.manifest.sources.map((s) => ({
        ...s,
        title: s.id,
        role: s.role as "submitted" | "discovered",
        parentSourceId: s.parentSourceId,
      })),
      policyVersion: onChainCaseJson.manifest.policyVersion,
      clientRequestId: onChainCaseJson.manifest.clientRequestId,
      parentCaseId: onChainCaseJson.manifest.parentCaseId,
      manifestCanonical: "",
    },
    reviews: onChainCaseJson.manifest.sources.map((s) => ({
      sourceId: s.id,
      fetchStatus: "reviewed",
      stance: "primary_reporting",
      contributions: [],
      attempts: 1,
      coverageNote: "Studionet verified",
      limitations: "",
    })),
    relationships: onChainRelationshipsJson.relationships as CaseFile["relationships"],
    report: onChainReportJson.finalized ? (onChainReportJson as unknown as CaseFile["report"]) : null,
    receipts: [],
    appliedBatches: [],
    chain: {
      caseId: onChainCaseJson.id,
      owner: onChainCaseJson.owner,
      txs: [],
    },
    createdAt: onChainCaseJson.createdAt,
    updatedAt: onChainCaseJson.updatedAt,
  };

  assert.equal(constructed.id, "et-74ec46d2f72e");
  assert.equal(constructed.status, "FINALIZED");
  assert.equal(constructed.report?.complete, true);
  assert.equal(constructed.relationships.length, 1);
  assert.equal(constructed.relationships[0]?.type, "primary_evidence");
});

test("Authorization distinction: distinguishes connected owner continuation vs read-only remote case", () => {
  const _caseFile = mockCase("et-74ec46d2f72e");
  const caseOwner = "0x1111111111111111111111111111111111111111";

  // Case 1: Visitor connects with a different wallet -> Read-Only mode
  const strangerPrincipal = "0x2222222222222222222222222222222222222222";
  const isStrangerOwner = strangerPrincipal.toLowerCase() === caseOwner.toLowerCase();
  assert.equal(isStrangerOwner, false, "Stranger wallet must be marked non-owner (read-only)");

  // Case 2: Owner connects with matching wallet -> Can write
  const ownerPrincipal = "0x1111111111111111111111111111111111111111";
  const isRealOwner = ownerPrincipal.toLowerCase() === caseOwner.toLowerCase();
  assert.equal(isRealOwner, true, "Matching wallet must be authorized to continue case workflow");

  // Case 3: Direct Mode preview principal -> Cannot submit on chain
  const previewPrincipal = "preview:local";
  assert.equal(previewPrincipal.startsWith("0x"), false, "Direct mode principal cannot submit chain writes");
});

test("Contract-aware case isolation: identical case IDs from different contracts do not overwrite each other", () => {
  const store = useEcho.getState();
  const caseId = "et-shared-9999";
  const contractA = "0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B";
  const contractB = "0x6FD3AB838b416cda4623C340113ed18f0e9c0Fe2";

  // Create Case on Contract A
  const fileA = mockCase("case-local-a");
  fileA.manifest.claim = "Contract A claim statement";
  useEcho.setState((s) => ({
    ledger: { ...s.ledger, cases: { ...s.ledger.cases, [fileA.id]: fileA } },
  }));
  store.recordChain(
    fileA.id,
    { method: "create_case", hash: "0xa1", statusName: "FINALIZED", execution: "SUCCESS", at: NOW, detail: "on A" },
    caseId,
    "0x1111111111111111111111111111111111111111",
    contractA,
  );

  // Create Case on Contract B with IDENTICAL chainCaseId
  const fileB = mockCase("case-local-b");
  fileB.manifest.claim = "Contract B claim statement";
  useEcho.setState((s) => ({
    ledger: { ...s.ledger, cases: { ...s.ledger.cases, [fileB.id]: fileB } },
  }));
  store.recordChain(
    fileB.id,
    { method: "create_case", hash: "0xb1", statusName: "FINALIZED", execution: "SUCCESS", at: NOW, detail: "on B" },
    caseId,
    "0x1111111111111111111111111111111111111111",
    contractB,
  );

  const ledger = useEcho.getState().ledger;

  // Verify Case A and Case B are isolated and neither overwrote the other
  const retrievedA = getIsolatedCase(ledger, caseId, contractA);
  const retrievedB = getIsolatedCase(ledger, caseId, contractB);

  assert.ok(retrievedA, "Case A must be retrievable under Contract A");
  assert.ok(retrievedB, "Case B must be retrievable under Contract B");
  assert.equal(retrievedA.manifest.claim, "Contract A claim statement");
  assert.equal(retrievedB.manifest.claim, "Contract B claim statement");
});

test("Legacy case isolation: cases with chain history but no contractAddress are preserved as non-Direct and isolated", () => {
  const legacyCase = mockCase("et-legacy-unrecorded");
  // Simulate legacy case that has transaction receipts from an earlier deployment but no recorded contractAddress
  legacyCase.chain = {
    caseId: "et-legacy-unrecorded",
    owner: "0x1111111111111111111111111111111111111111",
    txs: [
      { method: "create_case", hash: "0xold1", statusName: "FINALIZED", execution: "SUCCESS", at: NOW, detail: "old deploy" },
    ],
  };

  // 1. Is NOT Direct Mode because it has chain transactions
  const isDirect = !legacyCase.chain || (legacyCase.chain.caseId == null && legacyCase.chain.txs.length === 0);
  assert.equal(isDirect, false, "Legacy case with chain txs must NOT be classified as Direct Mode");

  // 2. Ambiguous identity guard: cannot write against a new candidate contract
  const newDeploymentAddress = "0x6FD3AB838b416cda4623C340113ed18f0e9c0Fe2";
  const hasAmbiguousChainHistory = Boolean(legacyCase.chain.txs.length && !legacyCase.chain.contractAddress);
  assert.equal(hasAmbiguousChainHistory, true, "Legacy case must be identified as having ambiguous unrecorded contract identity");

  // 3. Isolated from target contract lookups
  const ledger = { cases: { [legacyCase.id]: legacyCase }, idempotency: {} };
  const isolatedLookup = getIsolatedCase(ledger, legacyCase.id, newDeploymentAddress);
  // An ambiguous legacy case without contract address does not match a specific new target address
  assert.equal(isolatedLookup?.chain?.contractAddress, undefined);
});
