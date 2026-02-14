import { describe, it, expect } from "vitest";
import {
  sha256Bytes,
  sha256String,
  sha256Json,
  contentHash,
  canonicalJsonStringify,
  merkleRoot,
} from "../src/shared/hash.js";

describe("SHA-256 Hashing", () => {
  it("sha256Bytes produces consistent 64-char hex for same input", () => {
    const buf = Buffer.from("hello world");
    const h1 = sha256Bytes(buf);
    const h2 = sha256Bytes(buf);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sha256Bytes produces known hash for known input", () => {
    // SHA-256 of empty string
    const empty = sha256Bytes(Buffer.from(""));
    expect(empty).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("sha256String hashes UTF-8 strings", () => {
    const h = sha256String("test");
    expect(h).toHaveLength(64);
    expect(h).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  });

  it("sha256Json produces deterministic hash regardless of key order", () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    expect(sha256Json(obj1)).toBe(sha256Json(obj2));
  });

  it("different objects produce different hashes", () => {
    const h1 = sha256Json({ x: 1 });
    const h2 = sha256Json({ x: 2 });
    expect(h1).not.toBe(h2);
  });
});

describe("Canonical JSON", () => {
  it("sorts keys at all nesting levels", () => {
    const obj = { z: { b: 2, a: 1 }, a: [{ y: 1, x: 2 }] };
    const result = canonicalJsonStringify(obj);
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(["a", "z"]);
    expect(Object.keys(parsed.z)).toEqual(["a", "b"]);
  });

  it("preserves arrays in order", () => {
    const obj = { arr: [3, 1, 2] };
    const result = canonicalJsonStringify(obj);
    expect(JSON.parse(result).arr).toEqual([3, 1, 2]);
  });
});

describe("Content Hash", () => {
  it("produces consistent hash for same object structure", () => {
    const obj = { type: "test", value: 42 };
    expect(contentHash(obj)).toBe(contentHash({ type: "test", value: 42 }));
  });

  it("produces consistent hash regardless of key order", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });
});

describe("Merkle Root", () => {
  it("returns hash of empty string for empty array", () => {
    const root = merkleRoot([]);
    expect(root).toHaveLength(64);
  });

  it("returns the single hash for array of one", () => {
    const hash = "abc123def456abc123def456abc123def456abc123def456abc123def456abcd";
    expect(merkleRoot([hash])).toBe(hash);
  });

  it("combines two hashes into a root", () => {
    const h1 = sha256String("a");
    const h2 = sha256String("b");
    const root = merkleRoot([h1, h2]);
    expect(root).toHaveLength(64);
    expect(root).not.toBe(h1);
    expect(root).not.toBe(h2);
    // Verify deterministic
    expect(merkleRoot([h1, h2])).toBe(root);
  });

  it("handles odd number of hashes by duplicating last", () => {
    const h1 = sha256String("a");
    const h2 = sha256String("b");
    const h3 = sha256String("c");
    const root = merkleRoot([h1, h2, h3]);
    expect(root).toHaveLength(64);
  });
});
