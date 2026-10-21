import { fixtureFor } from "./fixtures.ts";
import {
  MAX_CLAIM,
  MAX_SOURCES,
  MAX_SUBMITTED,
  MIN_SUBMITTED,
  POLICY_VERSION,
  type SourceRef,
} from "./types.ts";

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  urls: string[];
  suggestions: { url: string; title: string; because: string }[];
  gaps: { url: string; label: string; because: string }[];
  policyVersion: string;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
]);

export function normalizeSpace(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function quoteAnchored(page: string, quote: string): boolean {
  const left = normalizeSpace(page);
  const right = normalizeSpace(quote);
  return right.length > 0 && left.includes(right);
}

function ipv4Blocked(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const n = m.slice(1).map((part) => Number(part));
  if (m.slice(1).some((part) => part.length > 1 && part.startsWith("0"))) return true;
  if (n.some((x) => x > 255)) return true;
  const [a, b] = n;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function normalizeHttpsUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Empty URL." };
  if (trimmed.length > 300) return { error: "URL is longer than 300 characters." };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Not a valid URL." };
  }
  if (parsed.protocol !== "https:") return { error: "Only public https URLs are accepted." };
  if (parsed.username || parsed.password) return { error: "Credentials in URLs are rejected." };
  if (parsed.port && parsed.port !== "443") return { error: "Non-standard ports are rejected." };
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (host !== "fixtures.echotrace.local") {
    if (
      BLOCKED_HOSTS.has(host) ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      ipv4Blocked(host) ||
      /^\d+$/.test(host) ||
      host.split(".").every((label) => /^\d+$/.test(label)) ||
      host.startsWith("0x") ||
      host.includes(":") ||
      host === "::1" ||
      host.startsWith("[") ||
      !/^[\x21-\x7e]+$/.test(host) ||
      raw.includes("%") ||
      raw.includes("\\")
    ) {
      return { error: "Private, loopback, or internal hosts are rejected." };
    }
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/$/, "") || "";
  return { url: `https://${host}${path}${parsed.search}` };
}

export function preflight(claim: string, rawUrls: string[]): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const claimText = normalizeSpace(claim);
  if (!claimText) errors.push("The claim is empty.");
  if (claimText.length > MAX_CLAIM) errors.push(`The claim exceeds ${MAX_CLAIM} characters.`);
  const urls: string[] = [];
  rawUrls.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const result = normalizeHttpsUrl(line);
    if ("error" in result) {
      errors.push(`Source ${index + 1}: ${result.error}`);
      return;
    }
    if (urls.includes(result.url)) {
      errors.push(`Duplicate URL: ${result.url}`);
      return;
    }
    urls.push(result.url);
    if (!fixtureFor(result.url)) {
      warnings.push(
        `${result.url} is not in the Direct Mode library. No quote will be invented. On a deployed contract, review uses gl.nondet.web.render.`,
      );
    }
  });
  if (urls.length < MIN_SUBMITTED) errors.push(`Submit at least ${MIN_SUBMITTED} URLs.`);
  if (urls.length > MAX_SUBMITTED) errors.push(`Submit at most ${MAX_SUBMITTED} URLs.`);

  const suggestions: PreflightResult["suggestions"] = [];
  const gaps: PreflightResult["gaps"] = [];
  const seenSuggest = new Set<string>();
  for (const url of urls) {
    const page = fixtureFor(url);
    if (!page) continue;
    for (const ref of page.references) {
      if (urls.includes(ref.url) || seenSuggest.has(ref.url)) continue;
      seenSuggest.add(ref.url);
      if (fixtureFor(ref.url)) suggestions.push(ref);
      else gaps.push({ url: ref.url, label: ref.title, because: ref.because });
    }
  }
  for (const url of urls) {
    const page = fixtureFor(url);
    page?.contributions.forEach((c) => {
      if (!c.originUrl || urls.includes(c.originUrl) || fixtureFor(c.originUrl)) return;
      if (gaps.some((g) => g.url === c.originUrl)) return;
      gaps.push({
        url: c.originUrl,
        label: c.originLabel,
        because: "Named by a submitted page, with no readable source in this set.",
      });
    });
  }
  if (urls.length + suggestions.length > MAX_SOURCES) {
    warnings.push("Accepting every suggestion would pass the 12-source cap. Add only what you mean to freeze.");
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    urls,
    suggestions,
    gaps,
    policyVersion: POLICY_VERSION,
  };
}

export function clarificationNote(claim: string): string | null {
  const text = normalizeSpace(claim);
  if (!text) return null;
  if (/\b(partnership occurred|they partnered|the deal happened|it happened)\b/i.test(text)) {
    return "This wording drops who spoke, whether it was announced or completed, and when. EchoTc will not rewrite it. If you mean the labeled example, approve this wording yourself: “Northwind and Harborline announced a joint coastal sensor pilot in March 2026.”";
  }
  return null;
}

export function buildSources(urls: string[], discoveries: string[]): SourceRef[] {
  const submitted = urls.map((url) => ({ url, role: "submitted" as const }));
  const extra = discoveries
    .filter((url) => !urls.includes(url))
    .map((url) => ({ url, role: "discovered" as const }));
  const all = [...submitted, ...extra].slice(0, MAX_SOURCES);
  return all.map((item, index) => {
    const page = fixtureFor(item.url);
    let parent: string | null = null;
    if (item.role === "discovered") {
      const parentIndex = all.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          fixtureFor(candidate.url)?.references.some((ref) => ref.url === item.url),
      );
      parent = parentIndex >= 0 ? `src-${parentIndex + 1}` : null;
    }
    return {
      id: `src-${index + 1}`,
      url: item.url,
      role: item.role,
      parentSourceId: parent,
      title: page?.title ?? "Unrendered source",
    };
  });
}

function asciiEscape(str: string): string {
  return JSON.stringify(str).replace(/[\u007f-\uffff]/g, (c) => {
    return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return asciiEscape(value);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => asciiEscape(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function canonicalManifest(input: {
  claim: string;
  sources: SourceRef[];
  clientRequestId: string;
  parentCaseId: string | null;
}): string {
  return canonicalJson({
    claim: normalizeSpace(input.claim),
    language: "en",
    sources: input.sources.map((s) => ({
      id: s.id,
      url: s.url,
      role: s.role,
      parentSourceId: s.parentSourceId,
    })),
    policyVersion: POLICY_VERSION,
    clientRequestId: input.clientRequestId,
    parentCaseId: input.parentCaseId,
  });
}
