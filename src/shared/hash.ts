import { createHash } from "crypto";

/** SHA-256 hash of raw bytes (Buffer). */
export function sha256Bytes(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** SHA-256 of a UTF-8 string. */
export function sha256String(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** SHA-256 of a JSON object with sorted keys (canonical form). */
export function sha256Json(obj: unknown): string {
  const canonical = JSON.stringify(obj, Object.keys(obj as object).sort());
  return sha256String(canonical);
}

/**
 * Canonical JSON stringify with deep-sorted keys.
 * Used for deterministic hashing of nested objects.
 */
export function canonicalJsonStringify(obj: unknown): string {
  return JSON.stringify(sortKeysDeep(obj));
}

function sortKeysDeep(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** Compute SHA-256 of a canonical JSON representation. */
export function contentHash(obj: unknown): string {
  return sha256String(canonicalJsonStringify(obj));
}

/** Simple Merkle root from an array of hashes. */
export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return sha256String("");
  if (hashes.length === 1) return hashes[0];

  const nextLevel: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = i + 1 < hashes.length ? hashes[i + 1] : left;
    nextLevel.push(sha256String(left + right));
  }
  return merkleRoot(nextLevel);
}
