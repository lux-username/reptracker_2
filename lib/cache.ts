// A tiny key/value cache interface. The whole app talks to this, not to a
// concrete store — Issue #7 swaps the in-memory default for Upstash Redis (and
// layers the daily-spend cap + per-minute rate limit on the LLM client on top).
//
// Summaries are cached by (bill_id, source_hash): if the CRS source text is
// revised the hash flips and we regenerate; otherwise the LLM output is reused
// indefinitely (spec → Caching strategy).

export interface KVCache {
  get(key: string): Promise<string | null>;
  /** ttlSeconds omitted ⇒ no expiry (summaries live until their source hash changes). */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

interface Entry {
  value: string;
  expiresAt: number | null;
}

/**
 * Process-memory cache. Sufficient for local dev and single-instance runs; it
 * does not survive restarts or share across serverless invocations — that's
 * what the Upstash backend in Issue #7 is for.
 */
export class MemoryCache implements KVCache {
  private store = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }
}

/** The default cache instance the app uses until Issue #7 wires Upstash. */
export const defaultCache: KVCache = new MemoryCache();
