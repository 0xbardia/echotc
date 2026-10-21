import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { execSync } from "node:child_process";

test("Evidence Integrity: exact quote length verification", () => {
  const quote1 =
    "As described in RFC 2606 and RFC 6761, a number of domains such as example.com and example.org are maintained for documentation purposes.";
  const quote2 =
    "They are reserved by the Internet Assigned Numbers Authority (IANA) at the direction of the Internet Engineering Task Force (IETF) as special-use domain names for documentation purposes.";

  assert.equal(quote1.length, 137, "src-1 quote length must be exactly 137 ASCII characters");
  assert.equal(quote2.length, 186, "src-2 quote length must be exactly 186 ASCII characters");
});

test("Evidence Integrity: canonical manifest digest computation", () => {
  const manifest = {
    claim: "The domain names example.com, example.net, and example.org are reserved for documentation purposes.",
    language: "en",
    sources: [
      { id: "src-1", parentSourceId: null, role: "submitted", url: "https://www.iana.org/domains/reserved" },
      { id: "src-2", parentSourceId: null, role: "submitted", url: "https://en.wikipedia.org/wiki/Example.com" },
      { id: "src-3", parentSourceId: null, role: "submitted", url: "https://httpbin.org/html" },
    ],
    policyVersion: "echotrace-policy-1.0.0",
    clientRequestId: "req-repaired-mm-mvhfpo8o",
    parentCaseId: null,
  };

  const canonicalObj = {
    claim: manifest.claim,
    clientRequestId: manifest.clientRequestId,
    language: manifest.language,
    parentCaseId: manifest.parentCaseId,
    policyVersion: manifest.policyVersion,
    sources: manifest.sources,
  };

  const keys = Object.keys(canonicalObj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of keys) sortedObj[k] = (canonicalObj as Record<string, unknown>)[k];

  const canonicalBytes = Buffer.from(JSON.stringify(sortedObj), "utf8");
  const digest = crypto.createHash("sha256").update(canonicalBytes).digest("hex");

  assert.equal(digest, "1c96863679c950cf3460444563363fa35c6e11178f198214c9522c6d66b66614");
});

test("Evidence Integrity: v1.0.0 tag object vs peeled commit separation", () => {
  const tagObject = execSync("git rev-parse refs/tags/v1.0.0", { encoding: "utf8" }).trim();
  const peeledCommit = execSync("git rev-parse 'refs/tags/v1.0.0^{commit}'", { encoding: "utf8" }).trim();

  assert.equal(tagObject, "728fd688b67d2300d8340d4c2aaaaffc5e6f83f8", "v1.0.0 tag object SHA");
  assert.equal(peeledCommit, "cb8abef0a36d55a557ed5e938475ffa3d725f84a", "v1.0.0 peeled commit SHA");
  assert.notEqual(tagObject, peeledCommit, "Tag object must remain distinct from peeled commit object");
});
