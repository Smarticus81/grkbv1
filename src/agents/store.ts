/**
 * InMemoryTaskStore
 *
 * Ephemeral store scoped to a single pipeline run.
 * Backed by a Map with composite keys; computes SHA-256 hashes on set.
 */

import { contentHash } from "../shared/hash.js";
import type { TaskStore, ProducedRef, ProducedRefKind } from "./types.js";

export class InMemoryTaskStore implements TaskStore {
  private data = new Map<string, unknown>();
  private refs = new Map<string, ProducedRef>();

  private key(kind: ProducedRefKind, id: string): string {
    return `${kind}::${id}`;
  }

  set(kind: ProducedRefKind, id: string, value: unknown): ProducedRef {
    const k = this.key(kind, id);
    const hash = contentHash(value);
    this.data.set(k, value);
    const ref: ProducedRef = { kind, id, hash };
    this.refs.set(k, ref);
    return ref;
  }

  get<T = unknown>(kind: ProducedRefKind, id: string): T {
    const k = this.key(kind, id);
    if (!this.data.has(k)) {
      throw new Error(`TaskStore: key not found — ${k}`);
    }
    return this.data.get(k) as T;
  }

  getByRef<T = unknown>(ref: ProducedRef): T {
    return this.get<T>(ref.kind, ref.id);
  }

  has(kind: ProducedRefKind, id: string): boolean {
    return this.data.has(this.key(kind, id));
  }

  getAllByKind<T = unknown>(kind: ProducedRefKind): Map<string, T> {
    const result = new Map<string, T>();
    for (const [k, v] of this.data) {
      if (k.startsWith(`${kind}::`)) {
        const id = k.slice(kind.length + 2);
        result.set(id, v as T);
      }
    }
    return result;
  }

  clear(): void {
    this.data.clear();
    this.refs.clear();
  }

  get size(): number {
    return this.data.size;
  }
}
