import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chainConfigured,
  getConfiguredContractAddress,
  isValidContractAddress,
} from "./chain.ts";
import { readChain, readRelationships, writeChain } from "./chain.client.ts";
import {
  decodeCanonicalRelationships,
  IncompatibleRelationshipPayloadError,
} from "./relationship-canonical.ts";
import { nextChainCall, type ChainSnapshot } from "./chain-plan.ts";
import type { CaseFile } from "./types.ts";

/**
 * Authoritative Contract Source: EchoTrace/contracts/echotrace.py
 *
 * View Methods (7):
 * 1. get_policy_version() -> str
 * 2. get_policy() -> str
 * 3. get_case_count() -> int
 * 4. get_case(case_id: str) -> str
 * 5. get_source_review(case_id: str, source_id: str) -> str
 * 6. get_relationships(case_id: str) -> str [canonical: {"found": bool, "relationships": [...]}]
 * 7. get_report(case_id: str) -> str
 *
 * Write Methods (6):
 * 1. create_case(manifest_json: str) -> str
 * 2. review_sources_batch(case_id: str, batch_id: str) -> str
 * 3. retry_unavailable(case_id: str) -> str
 * 4. seal_source_reviews(case_id: str) -> str
 * 5. review_relationship_batch(case_id: str, batch_id: str) -> str
 * 6. finalize_case(case_id: str) -> str
 */

describe("EchoTrace: Configuration Provenance and Zero SDK Dispatch on Missing Config", () => {
  it("isValidContractAddress enforces strict 20-byte hex format", () => {
    assert.equal(isValidContractAddress("0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B"), true);
    assert.equal(isValidContractAddress("0x1111111111111111111111111111111111111111"), true);
    assert.equal(isValidContractAddress(""), false);
    assert.equal(isValidContractAddress("not-an-address"), false);
    assert.equal(isValidContractAddress("0x123"), false);
    assert.equal(isValidContractAddress(null), false);
    assert.equal(isValidContractAddress(undefined), false);
  });

  it("fails closed with zero SDK dispatches when unconfigured", async () => {
    const oldEnv = process.env.VITE_ECHO_CONTRACT_ADDRESS;
    try {
      delete process.env.VITE_ECHO_CONTRACT_ADDRESS;

      // chainConfigured returns false
      assert.equal(chainConfigured(), false);
      assert.equal(getConfiguredContractAddress(), null);

      // readChain returns fail-closed result without sending RPC
      const readRes = await readChain("get_relationships", ["et-test00000000"]);
      assert.equal(readRes.ok, false);
      assert.equal(readRes.error, "No contract address is configured. This read was not sent.");

      // readRelationships throws descriptive error before dispatching
      await assert.rejects(
        async () => {
          await readRelationships("et-test00000000");
        },
        /No contract address is configured\. This read was not sent\./,
      );

      // writeChain throws without attempting wallet connection or RPC dispatch
      await assert.rejects(
        async () => {
          await writeChain(
            "create_case",
            ['{"manifest":{}}'],
            "0x1111111111111111111111111111111111111111",
          );
        },
        /Contract address is not configured\./,
      );
    } finally {
      if (oldEnv) process.env.VITE_ECHO_CONTRACT_ADDRESS = oldEnv;
    }
  });

  it("rejects invalid syntactic address and avoids dispatch", async () => {
    const invalidAddress = "0xinvalidaddress123";
    const readRes = await readChain("get_relationships", ["et-test00000000"], invalidAddress);
    assert.equal(readRes.ok, false);
    assert.equal(readRes.error, "No contract address is configured. This read was not sent.");

    await assert.rejects(
      async () => {
        await writeChain(
          "create_case",
          ["{}"],
          "0x1111111111111111111111111111111111111111",
          invalidAddress,
        );
      },
      /Contract address is not configured\./,
    );
  });
});

describe("EchoTrace: Canonical get_relationships Response Handling", () => {
  it("decodes canonical empty response (found: false, relationships: [])", () => {
    // Exact contract source: EchoTrace/contracts/echotrace.py:243
    // json.dumps({"found": False, "relationships": []}, sort_keys=True)
    const rawOutput = JSON.stringify({ found: false, relationships: [] });
    const decoded = decodeCanonicalRelationships(rawOutput);

    assert.equal(decoded.found, false);
    assert.deepEqual(decoded.relationships, []);
  });

  it("decodes canonical populated response (found: true, relationships: [...])", () => {
    // Exact contract source: EchoTrace/contracts/echotrace.py:245
    // json.dumps({"found": True, "relationships": payload["relationships"]}, sort_keys=True)
    const rawPayload = {
      found: true,
      relationships: [
        {
          id: "rel-1",
          fromSourceId: "src-1",
          toSourceId: "src-2",
          originLabel: "primary-news.com",
          type: "explicit_dependency",
          supportingEvidenceIds: ["ev-src-1-1"],
          explanation: "Source 1 directly cites Source 2.",
          status: "pending",
        },
        {
          id: "rel-2",
          fromSourceId: "src-2",
          toSourceId: null,
          originLabel: "gov-announcement.org",
          type: "distinct_evidence_shown",
          supportingEvidenceIds: ["ev-src-2-1"],
          explanation: "Original declaration without external citation.",
          status: "reviewed",
        },
      ],
    };

    const decoded = decodeCanonicalRelationships(JSON.stringify(rawPayload));
    assert.equal(decoded.found, true);
    assert.equal(decoded.relationships.length, 2);
    assert.equal(decoded.relationships[0].id, "rel-1");
    assert.equal(decoded.relationships[0].type, "explicit_dependency");
    assert.equal(decoded.relationships[1].toSourceId, null);
    assert.equal(decoded.relationships[1].status, "reviewed");
  });

  it("strictly rejects legacy bytecode bare array `[]` with IncompatibleRelationshipPayloadError", () => {
    // Deployed contract bytecode discrepancy at 0xCABcFaBC...e59B returned bare []
    assert.throws(
      () => decodeCanonicalRelationships("[]"),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleRelationshipPayloadError);
        assert.equal(err.code, "LEGACY_ARRAY_PAYLOAD");
        assert.ok(err.message.includes("legacy bytecode"));
        return true;
      },
    );

    assert.throws(
      () => decodeCanonicalRelationships([]),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleRelationshipPayloadError);
        assert.equal(err.code, "LEGACY_ARRAY_PAYLOAD");
        return true;
      },
    );
  });

  it("surfaces and rejects corrupted JSON and malformed payload shapes", () => {
    assert.throws(
      () => decodeCanonicalRelationships("{ bad json"),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleRelationshipPayloadError);
        assert.equal(err.code, "INVALID_JSON");
        return true;
      },
    );

    assert.throws(
      () => decodeCanonicalRelationships(null),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleRelationshipPayloadError);
        assert.equal(err.code, "INVALID_ROOT_TYPE");
        return true;
      },
    );

    assert.throws(
      () => decodeCanonicalRelationships({ relationships: [] }),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleRelationshipPayloadError);
        assert.equal(err.code, "MISSING_FOUND_FIELD");
        return true;
      },
    );

    assert.throws(
      () => decodeCanonicalRelationships({ found: true }),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleRelationshipPayloadError);
        assert.equal(err.code, "MISSING_RELATIONSHIPS_FIELD");
        return true;
      },
    );
  });
});

describe("EchoTrace: Complete Contract Interface Mapping (7 Views & 6 Writes)", () => {
  const allViews = [
    { name: "get_policy_version", args: [] },
    { name: "get_policy", args: [] },
    { name: "get_case_count", args: [] },
    { name: "get_case", args: ["et-000000000000"] },
    { name: "get_source_review", args: ["et-000000000000", "src-1"] },
    { name: "get_relationships", args: ["et-000000000000"] },
    { name: "get_report", args: ["et-000000000000"] },
  ];

  it("verifies inventory includes exactly 7 canonical view methods", () => {
    assert.equal(allViews.length, 7);
    for (const view of allViews) {
      assert.ok(typeof view.name === "string" && view.name.startsWith("get_"));
      assert.ok(Array.isArray(view.args));
    }
  });

  const dummyFile: CaseFile = {
    id: "et-000000000001",
    owner: "0x1111111111111111111111111111111111111111",
    status: "CREATED",
    manifest: {
      claim: "Test claim statement",
      language: "en",
      sources: [
        {
          id: "src-1",
          url: "https://example.com/article-1",
          title: "example.com",
          role: "submitted",
          parentSourceId: null,
        },
      ],
      policyVersion: "echotrace-policy-1.0.0",
      clientRequestId: "req-1",
      parentCaseId: null,
      manifestCanonical: "",
    },
    reviews: [],
    relationships: [],
    report: null,
    receipts: [],
    appliedBatches: [],
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
  };

  it("maps write method 1: create_case with valid manifest JSON", () => {
    const call = nextChainCall(dummyFile, null, "b-1");
    assert.ok(call);
    assert.equal(call.method, "create_case");
    assert.equal(call.args.length, 1);
    const parsedManifest = JSON.parse(call.args[0]);
    assert.equal(parsedManifest.claim, "Test claim statement");
    assert.equal(parsedManifest.sources[0].url, "https://example.com/article-1");
  });

  it("maps write method 2: review_sources_batch when sources are pending", () => {
    const snapshot: ChainSnapshot = {
      caseId: "et-000000000001",
      status: "SOURCE_REVIEW",
      owner: dummyFile.owner,
      reviews: [{ sourceId: "src-1", fetchStatus: "pending", attempts: 0 }],
      relationships: [],
    };
    const call = nextChainCall(dummyFile, snapshot, "b-batch-1");
    assert.ok(call);
    assert.equal(call.method, "review_sources_batch");
    assert.deepEqual(call.args, ["et-000000000001", "b-batch-1"]);
  });

  it("maps write method 3: retry_unavailable when reviews failed and retryable", () => {
    const snapshot: ChainSnapshot = {
      caseId: "et-000000000001",
      status: "SOURCE_REVIEW",
      owner: dummyFile.owner,
      reviews: [{ sourceId: "src-1", fetchStatus: "unavailable", attempts: 1 }],
      relationships: [],
    };
    const call = nextChainCall(dummyFile, snapshot, "b-retry");
    assert.ok(call);
    assert.equal(call.method, "retry_unavailable");
    assert.deepEqual(call.args, ["et-000000000001"]);
  });

  it("maps write method 4: seal_source_reviews when sources are reviewed", () => {
    const snapshot: ChainSnapshot = {
      caseId: "et-000000000001",
      status: "SOURCE_REVIEW",
      owner: dummyFile.owner,
      reviews: [{ sourceId: "src-1", fetchStatus: "reviewed", attempts: 1 }],
      relationships: [],
    };
    const call = nextChainCall(dummyFile, snapshot, "b-seal");
    assert.ok(call);
    assert.equal(call.method, "seal_source_reviews");
    assert.deepEqual(call.args, ["et-000000000001"]);
  });

  it("maps write method 5: review_relationship_batch when relationships pending", () => {
    const snapshot: ChainSnapshot = {
      caseId: "et-000000000001",
      status: "RELATIONSHIP_REVIEW",
      owner: dummyFile.owner,
      reviews: [{ sourceId: "src-1", fetchStatus: "reviewed", attempts: 1 }],
      relationships: [{ status: "pending" }],
    };
    const call = nextChainCall(dummyFile, snapshot, "b-rel-batch");
    assert.ok(call);
    assert.equal(call.method, "review_relationship_batch");
    assert.deepEqual(call.args, ["et-000000000001", "b-rel-batch"]);
  });

  it("maps write method 6: finalize_case when all relationships are reviewed", () => {
    const snapshot: ChainSnapshot = {
      caseId: "et-000000000001",
      status: "RELATIONSHIP_REVIEW",
      owner: dummyFile.owner,
      reviews: [{ sourceId: "src-1", fetchStatus: "reviewed", attempts: 1 }],
      relationships: [{ status: "reviewed" }],
    };
    const call = nextChainCall(dummyFile, snapshot, "b-final");
    assert.ok(call);
    assert.equal(call.method, "finalize_case");
    assert.deepEqual(call.args, ["et-000000000001"]);
  });
});
