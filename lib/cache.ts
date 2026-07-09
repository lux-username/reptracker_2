// Server-only response cache (Issue #7).
//
// Rep activity does not change minute-to-minute and Congress.gov enforces a
// 5,000 req/hour key limit, so every network response in the lookup fan-out is
// cached in Upstash Redis. The spec (§Caching strategy) sets three cadences:
// geocoding is effectively static (24h), reference data is slow-moving (4-6h),
// and the upcoming-events feed can change on short notice (30-60min).
//
// Graceful degradation is a hard requirement: with no Upstash credentials the
// client is null and every call falls straight through to its live loader, so
// dev, tests, and a cold cache behave exactly as an uncached request would. A
// Redis read/write failure is logged and likewise degrades — it never fails the
// request. A loader throw propagates *uncached*, so a Geocodio 422 or an HTTP
// error is never stored.
import { Redis } from "@upstash/redis";

/** TTLs in seconds, one per spec cache tier. */
export const TTL = {
  /** Geocoding: address → district is effectively static. Spec: 24h. */
  geocode: 24 * 60 * 60,
  /** Members, contact, legislation lists, bill CRS sources, committee data. Spec: 4-6h. */
  reference: 5 * 60 * 60,
  /** Committee-meeting list + details — the schedule can change <24h out. Spec: 30-60min. */
  events: 45 * 60,
  /**
   * Cron-managed artifacts (the upcoming-events index, convergent cursors). The
   * nightly pre-warm rewrites these; the TTL only has to outlive a single missed
   * cron so a skipped run degrades to yesterday's index, not a blank page.
   */
  prewarm: 40 * 60 * 60,
} as const;

/** Version prefix so a value-shape change can be invalidated by a bump. */
const NS = "rt:v1";

/** Namespaced cache key: `rt:v1:<kind>:<...parts>`. */
export function cacheKey(kind: string, ...parts: (string | number)[]): string {
  return [NS, kind, ...parts].join(":");
}

/**
 * Lazily construct the Redis client from env. Returns null when either credential
 * is absent — the signal that caching is disabled. Constructed per call: the
 * Upstash client is a stateless REST wrapper (no connection pool), so this is
 * cheap and keeps env changes (and test mocks) picked up immediately.
 */
export function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Return `key` from cache, or run `loader`, cache its result for `ttlSeconds`,
 * and return it. Cache misses, a disabled cache, and any Redis error all fall
 * through to `loader`; only a successful `loader` result is stored.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const client = redisClient();

  if (client) {
    try {
      const hit = await client.get<T>(key);
      // Upstash returns null for a missing key; treat null/undefined as a miss.
      if (hit !== null && hit !== undefined) return hit;
    } catch (e) {
      console.warn(`[cache] read failed for ${key}: ${String(e)}`);
    }
  }

  const value = await loader(); // a throw here propagates — nothing is cached

  if (client) {
    try {
      await client.set(key, value, { ex: ttlSeconds });
    } catch (e) {
      console.warn(`[cache] write failed for ${key}: ${String(e)}`);
    }
  }

  return value;
}
