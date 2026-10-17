import assert from "node:assert/strict";
import test from "node:test";
import { chainExecutionSucceeded, contractManifestJson, nextChainCall, type ChainSnapshot } from "./chain-plan.ts";
import type { CaseFile } from "./types.ts";

function file(): CaseFile {
  return {
    id: "et-local01",
    owner: "0xabc",
    status: "CREATED",
    manifest: {
      claim: "example.com is reserved.",
      language: "en",
      sources: [
        { id: "src-1", url: "https://example.com", role: "submitted", parentSourceId: null, title: "Example" },
        { id: "src-2", url: "https://example.org", role: "submitted", parentSourceId: null, title: "Example org" },
        { id: "src-3", url: "https://example.net", role: "submitted", parentSourceId: null, title: "Example net" },
      ],
      policyVersion: "echotrace-policy-1.0.0",
      clientRequestId: "req-public-1",
      parentCaseId: "et-abcd",
      manifestCanonical: "{}",
    },
    reviews: [],
    relationships: [],
    report: null,
    appliedBatches: [],
    receipts: [],
    createdAt: "t",
    updatedAt: "t",
  };
}

test("Studionet SUCCESS and the SDK name both count as execution success", () => {
  assert.equal(chainExecutionSucceeded("SUCCESS"), true);
  assert.equal(chainExecutionSucceeded("FINISHED_WITH_RETURN"), true);
  assert.equal(chainExecutionSucceeded("UNDETERMINED"), false);
});

test("create_case sends the manifest and drops a local parent id", () => {
  const call = nextChainCall(file(), null, "b1");
  assert.equal(call?.method, "create_case");
  const body = JSON.parse(contractManifestJson(file()));
  assert.equal(body.parentCaseId, null);
  assert.equal(body.sources.length, 3);
  assert.equal(body.clientRequestId, "req-public-1");
});

test("chain parent ids are kept", () => {
  const sample = file();
  sample.manifest.parentCaseId = "et-0123456789ab";
  const body = JSON.parse(contractManifestJson(sample));
  assert.equal(body.parentCaseId, "et-0123456789ab");
});

test("source, seal, relationship, and finalize follow the chain snapshot", () => {
  const sample = file();
  const created: ChainSnapshot = {
    caseId: "et-0123456789ab",
    status: "CREATED",
    owner: "0xabc",
    reviews: [{ sourceId: "src-1", fetchStatus: "pending", attempts: 0 }],
    relationships: [],
  };
  assert.equal(nextChainCall(sample, created, "b2")?.method, "review_sources_batch");
  const reviewing: ChainSnapshot = {
    ...created,
    status: "SOURCE_REVIEW",
    reviews: [{ sourceId: "src-1", fetchStatus: "reviewed", attempts: 1 }],
  };
  assert.equal(nextChainCall(sample, reviewing, "b3")?.method, "seal_source_reviews");
  const empty: ChainSnapshot = {
    ...created,
    status: "SOURCE_REVIEW",
    reviews: [{ sourceId: "src-1", fetchStatus: "unavailable", attempts: 1 }],
  };
  assert.equal(nextChainCall(sample, empty, "b4")?.method, "retry_unavailable");
  const rel: ChainSnapshot = {
    ...created,
    status: "RELATIONSHIP_REVIEW",
    relationships: [{ status: "pending" }],
  };
  assert.equal(nextChainCall(sample, rel, "b5")?.method, "review_relationship_batch");
  const done: ChainSnapshot = { ...rel, relationships: [{ status: "reviewed" }] };
  assert.equal(nextChainCall(sample, done, "b6")?.method, "finalize_case");
  assert.equal(nextChainCall(sample, { ...done, status: "FINALIZED" }, "b7"), null);
});
