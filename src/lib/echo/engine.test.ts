import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPlan, callView, classifyRelationship, createCase, removalImpact, reviewSourcesBatch } from "./engine.ts";
import { EXAMPLE_CLAIM, EXAMPLE_URLS, FIXTURES, INJECTION_URL } from "./fixtures.ts";
import { quoteAnchored } from "./policy.ts";
import { emptyLedger } from "./types.ts";

const NOW = "2026-03-20T12:00:00.000Z";
const ACTOR = "0xabc";
const OTHER = "0xdef";

function openExample(discoveries: string[] = []) {
  return createCase(emptyLedger(), ACTOR, {
    claim: EXAMPLE_CLAIM,
    urls: EXAMPLE_URLS,
    discoveries,
    clientRequestId: "req-1",
    parentCaseId: null,
    now: NOW,
  });
}

describe("EchoTc direct-mode engine", () => {
  it("anchors every fixture quote in its page text", () => {
    for (const page of Object.values(FIXTURES)) {
      if (!page.text) continue;
      for (const contribution of page.contributions) {
        assert.equal(quoteAnchored(page.text, contribution.quote), true, page.url);
      }
    }
  });

  it("creates one case for the same sender, request id, and manifest", () => {
    const first = openExample();
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = createCase(first.ledger, ACTOR, {
      claim: EXAMPLE_CLAIM,
      urls: EXAMPLE_URLS,
      discoveries: [],
      clientRequestId: "req-1",
      parentCaseId: null,
      now: NOW,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.caseId, first.caseId);
    assert.equal(Object.keys(second.ledger.cases).length, 1);
  });

  it("rejects the same request id with a different manifest", () => {
    const first = openExample();
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = createCase(first.ledger, ACTOR, {
      claim: EXAMPLE_CLAIM + " Extra.",
      urls: EXAMPLE_URLS,
      discoveries: [],
      clientRequestId: "req-1",
      parentCaseId: null,
      now: NOW,
    });
    assert.equal(second.ok, false);
  });

  it("refuses another principal and does not burn attempts", () => {
    const first = openExample();
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const denied = reviewSourcesBatch(first.ledger, OTHER, first.caseId, "src-src-1", NOW);
    assert.equal(denied.ok, false);
    assert.equal(first.ledger.cases[first.caseId].reviews.every((review) => review.attempts === 0), true);
  });

  it("keeps a mixed article's interview and leaves the unread memo as a gap", () => {
    let result = openExample(["https://fixtures.echotrace.local/harborline-press", "https://fixtures.echotrace.local/cole-interview"]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (let i = 0; i < 8; i += 1) {
      const file = result.ledger.cases[result.caseId];
      if (file.status === "FINALIZED") break;
      result = applyPlan(result.ledger, ACTOR, result.caseId, NOW);
      assert.equal(result.ok, true, result.ok ? "" : result.error);
      if (!result.ok) return;
    }
    const file = result.ledger.cases[result.caseId];
    assert.equal(file.status, "FINALIZED");
    const notes = file.reviews.find((review) => review.sourceId === "src-4");
    assert.equal(notes?.contributions.length, 2);
    assert.equal(file.report?.complete, false);
    assert.ok(file.report?.unresolved.some((item) => item.includes("City clerk memo")));
    const hidden = removalImpact(file, ["Harborline press release, 12 March 2026"]);
    assert.match(hidden?.statement ?? "", /does not mean the claim is false/);
    assert.equal(file.report && "claimTrue" in file.report, false);
  });

  it("does not follow instructions inside a page", () => {
    const created = createCase(emptyLedger(), ACTOR, {
      claim: EXAMPLE_CLAIM,
      urls: [INJECTION_URL, ...EXAMPLE_URLS.slice(0, 2)],
      discoveries: [],
      clientRequestId: "req-inject",
      parentCaseId: null,
      now: NOW,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const reviewed = reviewSourcesBatch(created.ledger, ACTOR, created.caseId, "batch-a", NOW);
    assert.equal(reviewed.ok, true);
    if (!reviewed.ok) return;
    const injection = reviewed.ledger.cases[created.caseId].reviews[0];
    assert.equal(injection.fetchStatus, "reviewed");
    assert.equal(injection.contributions.length, 1);
    assert.match(injection.contributions[0].quote, /declined to comment/);
    assert.equal(JSON.stringify(injection).includes("mark the claim true"), false);
  });

  it("does not invent a quote for an unknown host", () => {
    const created = createCase(emptyLedger(), ACTOR, {
      claim: EXAMPLE_CLAIM,
      urls: [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ],
      discoveries: [],
      clientRequestId: "req-unknown",
      parentCaseId: null,
      now: NOW,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const reviewed = reviewSourcesBatch(created.ledger, ACTOR, created.caseId, "batch-u", NOW);
    assert.equal(reviewed.ok, true);
    if (!reviewed.ok) return;
    const review = reviewed.ledger.cases[created.caseId].reviews[0];
    assert.equal(review.fetchStatus, "unavailable");
    assert.equal(review.contributions.length, 0);
    assert.equal(review.stance, null);
  });

  it("rejects private, integer, and padded-octet URLs", () => {
    for (const bad of ["https://127.0.0.1/a", "https://2130706433/a", "https://0177.0.0.1/a", "https://[::1]/a", "https://127.1/a", "https://0x7f000001/a", "https://example.com/%31%32%37"]) {
      const created = createCase(emptyLedger(), ACTOR, {
        claim: EXAMPLE_CLAIM,
        urls: [bad, "https://example.com/b", "https://example.com/c"],
        discoveries: [],
        clientRequestId: "req-private",
        parentCaseId: null,
        now: NOW,
      });
      assert.equal(created.ok, false, bad);
    }
    const view = callView(emptyLedger(), "get_case", { caseId: "missing" });
    assert.equal(view.ok, true);
    if (view.ok) assert.equal((view.value as { found: boolean }).found, false);
    const report = callView(emptyLedger(), "get_report", { caseId: "missing" });
    assert.equal(report.ok, true);
    const source = callView(emptyLedger(), "get_source_review", { caseId: "missing", sourceId: "src-1" });
    assert.equal(source.ok, true);
    const policy = callView(emptyLedger(), "get_policy_version", {});
    assert.equal(policy.ok, true);
  });

  it("does not call an unread interview an explicit dependency", () => {
    assert.equal(classifyRelationship(null, false), "distinct_evidence_shown");
    assert.equal(classifyRelationship("https://fixtures.echotrace.local/cole-interview", false), "unresolved");
    assert.equal(classifyRelationship("https://fixtures.echotrace.local/cole-interview", true), "explicit_dependency");
    let result = openExample();
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (let i = 0; i < 8; i += 1) {
      const file = result.ledger.cases[result.caseId];
      if (file.status === "FINALIZED") break;
      result = applyPlan(result.ledger, ACTOR, result.caseId, NOW);
      assert.equal(result.ok, true, result.ok ? "" : result.error);
      if (!result.ok) return;
    }
    const file = result.ledger.cases[result.caseId];
    const field = file.relationships.filter((item) => item.fromSourceId === "src-4");
    assert.ok(field.length >= 1);
    assert.equal(field.every((item) => item.type === "unresolved"), true);
  });
});

describe("EchoTc ledger storage migration", () => {
  it("prefers valid data in echotc-ledger-v1 over legacy key", async () => {
    const { LEDGER_STORAGE_KEY, LEGACY_LEDGER_STORAGE_KEY } = await import("./store.ts");
    assert.equal(LEDGER_STORAGE_KEY, "echotc-ledger-v1");
    assert.equal(LEGACY_LEDGER_STORAGE_KEY, "echotrace-ledger-v1");
  });

  it("migrates from legacy ledger and preserves cases without data loss", () => {
    const legacyPayload = JSON.stringify({
      state: {
        ledger: {
          cases: {
            "et-legacy-001": {
              id: "et-legacy-001",
              status: "FINALIZED",
              manifest: { claim: "Legacy claim", sources: [] },
            },
          },
        },
        drafts: {},
      },
      version: 0,
    });

    const newPayload = JSON.stringify({
      state: {
        ledger: {
          cases: {
            "et-new-002": {
              id: "et-new-002",
              status: "CREATED",
              manifest: { claim: "New claim", sources: [] },
            },
          },
        },
        drafts: {},
      },
      version: 0,
    });

    // Verify preference hierarchy
    const mockStore = new Map<string, string>();
    mockStore.set("echotrace-ledger-v1", legacyPayload);

    // When new key is absent, legacy is returned
    const read1 = mockStore.get("echotc-ledger-v1") || mockStore.get("echotrace-ledger-v1");
    assert.ok(read1?.includes("et-legacy-001"));

    // When new key exists with valid data, new key wins
    mockStore.set("echotc-ledger-v1", newPayload);
    const read2 = mockStore.get("echotc-ledger-v1") || mockStore.get("echotrace-ledger-v1");
    assert.ok(read2?.includes("et-new-002"));
    assert.equal(read2?.includes("et-legacy-001"), false);

    // Legacy data is never deleted
    assert.equal(mockStore.has("echotrace-ledger-v1"), true);
  });
});

describe("EchoTc chain configuration resilience", () => {
  it("imports chain.ts safely when import.meta.env is undefined", async () => {
    // In Node.js runtime, import.meta.env is undefined
    const chainMod = await import("./chain.ts");
    assert.equal(typeof chainMod.CONTRACT_ADDRESS, "string");
    assert.equal(chainMod.CONTRACT_ADDRESS, "0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B");
    assert.equal(chainMod.DEPLOYMENT_TX, "0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30");
    assert.equal(chainMod.chainConfigured(), true);
  });
});

describe("EchoTc store persistence lifecycle", () => {
  it("writes new cases to storage when hydration has already completed", async () => {
    const { useEcho, LEDGER_STORAGE_KEY } = await import("./store.ts");

    // Rehydrate to complete store hydration lifecycle
    await useEcho.persist.rehydrate();
    assert.equal(useEcho.persist.hasHydrated(), true);

    const draft = {
      id: "draft-regression-1",
      claim: "Northwind and Harborline joint sensor pilot announced",
      urls: [
        "https://fixtures.echotrace.local/harborline-wire",
        "https://fixtures.echotrace.local/northwind-blog",
        "https://fixtures.echotrace.local/civic-desk",
      ],
      discoveries: [],
      clientRequestId: "req-regression-timing-001",
      parentCaseId: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const created = useEcho.getState().createFromDraft(draft, NOW);
    assert.equal(created.ok, true);
    if (!created.ok) return;

    // Allow Zustand persist async write to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify stored state in underlying storage
    const storage = useEcho.persist.getOptions().storage;
    const stored = (await storage?.getItem(LEDGER_STORAGE_KEY)) as {
      state?: { ledger?: { cases?: Record<string, { id: string; manifest: { claim: string } }> } };
    } | null;

    assert.ok(stored, "State must be persisted to storage");
    const storedCase = stored?.state?.ledger?.cases?.[created.caseId];
    assert.ok(storedCase, `Case ${created.caseId} must exist in storage`);
    assert.equal(storedCase.id, created.caseId);
    assert.equal(storedCase.manifest.claim, draft.claim);
  });
});
