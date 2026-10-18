/**
 * Canonical Relationship Definition and Decoder for EchoTrace.
 *
 * Authoritative Source:
 * EchoTrace/contracts/echotrace.py:240-245
 *
 * Exact Python contract implementation:
 *   @gl.public.view
 *   def get_relationships(self, case_id: str) -> str:
 *       payload = self._peek(case_id)
 *       if not payload:
 *           return json.dumps({"found": False, "relationships": []}, sort_keys=True)
 *       return json.dumps({"found": True, "relationships": payload["relationships"]}, sort_keys=True)
 */

import type { Relationship, RelType, ItemStatus } from "./types.ts";

export interface CanonicalGetRelationshipsResult {
  found: boolean;
  relationships: Relationship[];
}

export class IncompatibleRelationshipPayloadError extends Error {
  code: string;
  rawPayload: unknown;
  constructor(code: string, message: string, rawPayload?: unknown) {
    super(message);
    this.name = "IncompatibleRelationshipPayloadError";
    this.code = code;
    this.rawPayload = rawPayload;
  }
}

/**
 * Validates and decodes the canonical get_relationships payload returned by the smart contract.
 * Rejects legacy bare arrays (e.g. `[]`) and malformed objects with explicit errors.
 */
export function decodeCanonicalRelationships(raw: unknown): CanonicalGetRelationshipsResult {
  let parsed: unknown = raw;

  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new IncompatibleRelationshipPayloadError(
        "INVALID_JSON",
        `get_relationships return string is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        raw,
      );
    }
  }

  // Detect and reject legacy bare array bytecode discrepancy
  if (Array.isArray(parsed)) {
    throw new IncompatibleRelationshipPayloadError(
      "LEGACY_ARRAY_PAYLOAD",
      'get_relationships returned a bare array `[]` (legacy bytecode). Canonical contract specification requires `{"found": boolean, "relationships": [...]}`.',
      parsed,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new IncompatibleRelationshipPayloadError(
      "INVALID_ROOT_TYPE",
      `get_relationships return payload must be an object, received: ${typeof parsed}`,
      parsed,
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.found !== "boolean") {
    throw new IncompatibleRelationshipPayloadError(
      "MISSING_FOUND_FIELD",
      "Canonical get_relationships payload missing boolean `found` field.",
      parsed,
    );
  }

  if (!Array.isArray(obj.relationships)) {
    throw new IncompatibleRelationshipPayloadError(
      "MISSING_RELATIONSHIPS_FIELD",
      "Canonical get_relationships payload missing array `relationships` field.",
      parsed,
    );
  }

  const relationships: Relationship[] = [];

  for (let i = 0; i < obj.relationships.length; i++) {
    const item = obj.relationships[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new IncompatibleRelationshipPayloadError(
        "MALFORMED_RELATIONSHIP_ITEM",
        `Relationship item at index ${i} is not a valid object.`,
        item,
      );
    }

    const rel = item as Record<string, unknown>;

    if (typeof rel.id !== "string" || !rel.id.trim()) {
      throw new IncompatibleRelationshipPayloadError(
        "INVALID_RELATIONSHIP_ID",
        `Relationship item at index ${i} missing valid string \`id\`.`,
        item,
      );
    }

    if (typeof rel.fromSourceId !== "string" || !rel.fromSourceId.trim()) {
      throw new IncompatibleRelationshipPayloadError(
        "INVALID_FROM_SOURCE_ID",
        `Relationship item at index ${i} missing valid string \`fromSourceId\`.`,
        item,
      );
    }

    if (rel.toSourceId !== null && typeof rel.toSourceId !== "string") {
      throw new IncompatibleRelationshipPayloadError(
        "INVALID_TO_SOURCE_ID",
        `Relationship item at index ${i} \`toSourceId\` must be string or null.`,
        item,
      );
    }

    if (typeof rel.type !== "string" || !rel.type.trim()) {
      throw new IncompatibleRelationshipPayloadError(
        "INVALID_RELATIONSHIP_TYPE",
        `Relationship item at index ${i} missing valid string \`type\`.`,
        item,
      );
    }

    const supportingEvidenceIds: string[] = Array.isArray(rel.supportingEvidenceIds)
      ? rel.supportingEvidenceIds.map((s) => String(s).trim()).filter(Boolean)
      : [];

    relationships.push({
      id: rel.id.trim(),
      fromSourceId: rel.fromSourceId.trim(),
      toSourceId: typeof rel.toSourceId === "string" ? rel.toSourceId.trim() : null,
      originLabel: typeof rel.originLabel === "string" ? rel.originLabel.trim() : "",
      type: rel.type.trim() as RelType,
      supportingEvidenceIds,
      explanation: typeof rel.explanation === "string" ? rel.explanation.trim() : "",
      status: (typeof rel.status === "string" ? rel.status.trim() : "pending") as ItemStatus,
    });
  }

  return {
    found: obj.found,
    relationships,
  };
}
