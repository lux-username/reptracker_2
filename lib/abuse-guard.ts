// Abuse / quota protection (Issue #41).
//
// Our lookup flow calls paid/rate-limited third parties — Geocodio (2 credits per
// call, free tier 2,500/day) and Congress.gov. Nothing else stops an automated
// scraper from spraying unique/garbage addresses to force cache misses and drain
// the daily Geocodio free tier, degrading the tool for real constituents. Two
// no-new-vendor guards, both backed by the Upstash Redis we already run:
//
//   1. Per-IP rate limit — a fixed-window counter per IP over a short window and
//      a daily window. Silent (no visible challenge); the caller degrades the
//      lookup to a friendly "slow down" message. First line of defense.
//   2. Global daily circuit breaker — a per-UTC-day counter of Geocodio credits
//      spent. Reserved *before* each live geocode so total spend hard-stops at
//      the free-tier cap (2,500/day, owner decision 2026-07-15) regardless of
//      source. Protects the wallet even against distributed/low-per-IP traffic.
//
// Graceful degradation (matches lib/cache.ts): with no Redis credentials both
// guards ALLOW — they are best-effort protection, never a reason to fail a real
// request over missing infra. Production runs Redis, where they do their job.
//
// The clock is injectable so the window math is deterministically testable; the
// Redis client is read via the shared `redisClient()` so tests mock one place.
import { cacheKey, redisClient } from "./cache";

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// --- Per-IP rate limit -----------------------------------------------------

/** Per-IP limits. Env-tunable; defaults chosen to never bother a real human
 *  doing a handful of lookups while throttling a scripted flood. */
export interface RateLimitConfig {
  /** Max requests per IP in the short (per-minute) window. */
  perMinute: number;
  /** Max requests per IP in the rolling calendar day (UTC). */
  perDay: number;
}

export function rateLimitConfig(): RateLimitConfig {
  return {
    perMinute: intEnv("RATE_LIMIT_PER_MIN", 12),
    perDay: intEnv("RATE_LIMIT_PER_DAY", 80),
  };
}

export interface RateLimitResult {
  /** True when the request may proceed. */
  allowed: boolean;
  /** Which window rejected it (for logging/messaging), or null when allowed. */
  window: "minute" | "day" | null;
}

const ALLOW: RateLimitResult = { allowed: true, window: null };

/**
 * A single fixed-window counter: INCR the window key, set its TTL on first hit,
 * and reject once the count exceeds `limit`. Fixed-window (not sliding) is the
 * cheap, well-understood choice and is plenty for abuse throttling. Any Redis
 * error degrades to "allowed" — the request is never failed over infra trouble.
 */
async function hitWindow(
  key: string,
  limit: number,
  ttlSeconds: number,
): Promise<boolean> {
  const client = redisClient();
  if (!client) return true; // no cache configured → no limiting (best-effort)
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, ttlSeconds);
    return count <= limit;
  } catch (e) {
    console.warn(`[abuse-guard] rate-limit read failed for ${key}: ${String(e)}`);
    return true;
  }
}

/**
 * Check (and count) one request from `ip` against both windows. The minute
 * window is checked first so a burst trips it before the day counter is even
 * touched. An empty/unknown IP is bucketed under "unknown" — better to share one
 * conservative bucket than to skip limiting entirely.
 */
export async function checkRateLimit(
  ip: string,
  now: number,
  config: RateLimitConfig = rateLimitConfig(),
): Promise<RateLimitResult> {
  const who = ip.trim() || "unknown";
  const minuteBucket = Math.floor(now / 60_000);
  const dayBucket = Math.floor(now / 86_400_000);

  const minuteOk = await hitWindow(
    cacheKey("rl-min", who, minuteBucket),
    config.perMinute,
    120, // outlive the 60s window with margin
  );
  if (!minuteOk) return { allowed: false, window: "minute" };

  const dayOk = await hitWindow(
    cacheKey("rl-day", who, dayBucket),
    config.perDay,
    2 * 86_400, // outlive the calendar day
  );
  if (!dayOk) return { allowed: false, window: "day" };

  return ALLOW;
}

// --- Global daily Geocodio circuit breaker ---------------------------------

/** Geocodio charges 2 credits per `cd` (congressional district) lookup. */
export const GEOCODIO_CREDITS_PER_CALL = 2;

/** Daily credit ceiling. Default is the free tier (owner decision 2026-07-15:
 *  hard-stop at 2,500/day, never incur paid overage). Env-tunable. */
export function geocodeDailyCap(): number {
  return intEnv("GEOCODIO_DAILY_CAP", 2500);
}

/** UTC day key so the counter rolls over at midnight UTC, matching Geocodio's
 *  daily free-tier reset semantics closely enough for a wallet guard. */
function geoBudgetKey(now: number): string {
  return cacheKey("geo-budget", Math.floor(now / 86_400_000));
}

/**
 * Reserve `credits` against today's Geocodio budget before a live geocode.
 * Returns true when the spend fits under the cap (proceed) and false when it
 * would breach it (the caller must NOT call Geocodio and should surface a
 * try-again-later message). Reserve-before-spend means a concurrent burst can't
 * race past the cap. Only *live* calls should reserve — cache hits are free and
 * must not consume budget, so this is invoked on the cache-miss path.
 *
 * No Redis → returns true (degrade to allow), same posture as the rate limit.
 */
export async function reserveGeocodeCredits(
  credits: number = GEOCODIO_CREDITS_PER_CALL,
  now: number = Date.now(),
  cap: number = geocodeDailyCap(),
): Promise<boolean> {
  const client = redisClient();
  if (!client) return true;
  const key = geoBudgetKey(now);
  try {
    const total = await client.incrby(key, credits);
    if (total === credits) await client.expire(key, 2 * 86_400);
    if (total > cap) {
      console.warn(
        `[abuse-guard] Geocodio daily cap ${cap} reached (would be ${total}); blocking live geocode`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[abuse-guard] geocode-budget reserve failed: ${String(e)}`);
    return true; // degrade to allow — never fail a real lookup over infra
  }
}
