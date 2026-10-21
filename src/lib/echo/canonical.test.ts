import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { canonicalManifest } from "./policy.ts";

function pythonCanonical(manifest: unknown): string {
  const jsonStr = JSON.stringify(manifest);
  const cmd = `python3 -c '
import sys, json
incoming = json.loads(sys.argv[1])
body = {
    "claim": incoming["claim"],
    "language": "en",
    "sources": incoming["sources"],
    "policyVersion": incoming["policyVersion"],
    "clientRequestId": incoming["clientRequestId"],
    "parentCaseId": incoming["parentCaseId"],
}
print(json.dumps(body, sort_keys=True, separators=(",", ":")), end="")
' '${jsonStr.replace(/'/g, "'\\''")}'`;
  return execSync(cmd, { encoding: "utf8" });
}

test("Golden-vector 1: exact frozen acceptance manifest", () => {
  const claim = "The domain names example.com, example.net, and example.org are reserved for documentation purposes.";
  const sources = [
    { id: "src-1", url: "https://www.iana.org/domains/reserved", role: "submitted" as const, parentSourceId: null, title: "IANA" },
    { id: "src-2", url: "https://en.wikipedia.org/wiki/Example.com", role: "submitted" as const, parentSourceId: null, title: "Wiki" },
    { id: "src-3", url: "https://httpbin.org/html", role: "submitted" as const, parentSourceId: null, title: "HttpBin" },
  ];
  const clientRequestId = "req-acceptance-live-001";
  const tsCanonical = canonicalManifest({ claim, sources, clientRequestId, parentCaseId: null });
  const pyCanonical = pythonCanonical({
    claim,
    sources: sources.map((s) => ({ id: s.id, url: s.url, role: s.role, parentSourceId: s.parentSourceId })),
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId,
    parentCaseId: null,
  });

  assert.equal(tsCanonical, pyCanonical);
  const digest = crypto.createHash("sha256").update(tsCanonical, "utf8").digest("hex");
  assert.equal(digest, "1728ec12fb3f6a943f893fe3d85ccc2d937ea0c8af3cb6de561f7822146c90a1");
});

test("Golden-vector 2: different object insertion orders in nested source objects", () => {
  const claim = "Testing object key insertion permutation invariance";
  // Create sources where keys were inserted in inverted order
  const sources = [
    JSON.parse('{"title":"A","parentSourceId":null,"role":"submitted","url":"https://example.com/a","id":"src-1"}'),
    JSON.parse('{"url":"https://example.com/b","id":"src-2","role":"submitted","parentSourceId":"src-1","title":"B"}'),
    JSON.parse('{"role":"submitted","title":"C","parentSourceId":null,"id":"src-3","url":"https://example.com/c"}'),
  ];
  const clientRequestId = "req-perm-key-002";
  const tsCanonical = canonicalManifest({ claim, sources, clientRequestId, parentCaseId: null });
  const pyCanonical = pythonCanonical({
    claim,
    sources: [
      { id: "src-1", parentSourceId: null, role: "submitted", url: "https://example.com/a" },
      { id: "src-2", parentSourceId: "src-1", role: "submitted", url: "https://example.com/b" },
      { id: "src-3", parentSourceId: null, role: "submitted", url: "https://example.com/c" },
    ],
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId,
    parentCaseId: null,
  });

  assert.equal(tsCanonical, pyCanonical);
  assert.equal(
    crypto.createHash("sha256").update(tsCanonical, "utf8").digest("hex"),
    crypto.createHash("sha256").update(pyCanonical, "utf8").digest("hex"),
  );
});

test("Golden-vector 3: Persian text and emoji", () => {
  const claim = "نام‌های دامنه برای مستندات رزرو شده‌اند 🔍 و هیچ کاربری نمی‌تواند آن‌ها را ثبت کند.";
  const sources = [
    { id: "src-1", url: "https://example.com/fa/doc", role: "submitted" as const, parentSourceId: null, title: "Doc" },
    { id: "src-2", url: "https://example.com/fa/info", role: "submitted" as const, parentSourceId: null, title: "Info" },
    { id: "src-3", url: "https://example.com/fa/test", role: "submitted" as const, parentSourceId: null, title: "Test" },
  ];
  const clientRequestId = "req-persian-003";
  const tsCanonical = canonicalManifest({ claim, sources, clientRequestId, parentCaseId: null });
  const pyCanonical = pythonCanonical({
    claim,
    sources: sources.map((s) => ({ id: s.id, url: s.url, role: s.role, parentSourceId: s.parentSourceId })),
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId,
    parentCaseId: null,
  });

  assert.equal(tsCanonical, pyCanonical);
  assert.equal(
    crypto.createHash("sha256").update(tsCanonical, "utf8").digest("hex"),
    crypto.createHash("sha256").update(pyCanonical, "utf8").digest("hex"),
  );
});

test("Golden-vector 4: quotes, backslashes, and newlines in claim (normalized whitespace)", () => {
  const claim = 'Claim with "double quotes", backslash \\ and \n newline \t tabs.';
  const sources = [
    { id: "src-1", url: "https://example.com/special-1", role: "submitted" as const, parentSourceId: null, title: "S1" },
    { id: "src-2", url: "https://example.com/special-2", role: "submitted" as const, parentSourceId: null, title: "S2" },
    { id: "src-3", url: "https://example.com/special-3", role: "submitted" as const, parentSourceId: null, title: "S3" },
  ];
  const clientRequestId = "req-escapes-004";
  const tsCanonical = canonicalManifest({ claim, sources, clientRequestId, parentCaseId: null });
  // normalizeSpace turns multiple spaces/newlines/tabs into single space:
  // 'Claim with "double quotes", backslash \\ and newline tabs.'
  const expectedClaim = 'Claim with "double quotes", backslash \\ and newline tabs.';
  const pyCanonical = pythonCanonical({
    claim: expectedClaim,
    sources: sources.map((s) => ({ id: s.id, url: s.url, role: s.role, parentSourceId: s.parentSourceId })),
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId,
    parentCaseId: null,
  });

  assert.equal(tsCanonical, pyCanonical);
});

test("Golden-vector 5: null parentCaseId and parentSourceId values", () => {
  const claim = "Null testing claim value";
  const sources = [
    { id: "src-1", url: "https://example.com/null-1", role: "submitted" as const, parentSourceId: null, title: "N1" },
    { id: "src-2", url: "https://example.com/null-2", role: "submitted" as const, parentSourceId: null, title: "N2" },
    { id: "src-3", url: "https://example.com/null-3", role: "submitted" as const, parentSourceId: null, title: "N3" },
  ];
  const clientRequestId = "req-null-005";
  const tsCanonical = canonicalManifest({ claim, sources, clientRequestId, parentCaseId: null });
  const pyCanonical = pythonCanonical({
    claim,
    sources: sources.map((s) => ({ id: s.id, url: s.url, role: s.role, parentSourceId: s.parentSourceId })),
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId,
    parentCaseId: null,
  });

  assert.equal(tsCanonical, pyCanonical);
  assert.ok(tsCanonical.includes('"parentCaseId":null'));
  assert.ok(tsCanonical.includes('"parentSourceId":null'));
});

test("Golden-vector 6: preserved source-array order", () => {
  const claim = "Array ordering must not be sorted alphabetically by id or url";
  // Non-alphabetical source order
  const sources = [
    { id: "src-z", url: "https://example.com/zebra", role: "submitted" as const, parentSourceId: null, title: "Z" },
    { id: "src-a", url: "https://example.com/apple", role: "submitted" as const, parentSourceId: null, title: "A" },
    { id: "src-m", url: "https://example.com/mango", role: "submitted" as const, parentSourceId: null, title: "M" },
  ];
  const clientRequestId = "req-array-order-006";
  const tsCanonical = canonicalManifest({ claim, sources, clientRequestId, parentCaseId: null });
  const pyCanonical = pythonCanonical({
    claim,
    sources: sources.map((s) => ({ id: s.id, url: s.url, role: s.role, parentSourceId: s.parentSourceId })),
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId,
    parentCaseId: null,
  });

  assert.equal(tsCanonical, pyCanonical);
  // Verify order in output string is zebra, then apple, then mango
  const idxZ = tsCanonical.indexOf("zebra");
  const idxA = tsCanonical.indexOf("apple");
  const idxM = tsCanonical.indexOf("mango");
  assert.ok(idxZ < idxA && idxA < idxM, "Array elements must maintain their exact input sequence");
});
