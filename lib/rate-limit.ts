// Client-side rate limiter for the Congress.gov fetch path (Issue #17).
//
// Congress.gov enforces 5,000 requests/hour per key. A single warm user lookup
// is well under that, but the nightly pre-warm cron (#16) walks all 535 members
// plus a full event sweep in one burst — and a cache-busting flood on a cold
// cache is the same shape of traffic. A shared token bucket in front of every
// Congress.gov `fetch` lets bulk work self-pace under the hourly quota (spec
// §Cost guardrails).
//
// Model: a token bucket with a large burst capacity (so one legitimate cron run
// or user lookup passes without ever waiting) and a sustained refill rate that
// keeps the worst-case hour under the quota. With defaults BURST=1000 and
// 60 tokens/min, the most a single instance can spend in any hour is
// BURST + 60*60 = 4600 < 5000. Once the bucket drains (a flood), callers queue
// at the refill rate — exactly the back-pressure we want.
//
// Scope caveat: this is per-process (in-memory), so on Vercel each function
// instance keeps its own bucket — it is a best-effort self-pacing guardrail, not
// a distributed hard cap. That matches the issue's intent; the cron (the real
// bulk consumer) runs on a single instance where the bucket does its job.

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A refilling token bucket. `take()` resolves immediately while tokens remain and
 * otherwise waits just long enough for one to accrue. The clock and sleep are
 * injectable so the refill math is deterministically testable.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly ratePerSec: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.ratePerSec);
    this.last = t;
  }

  /** Tokens available right now (after refill). Exposed for tests. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Acquire one token, waiting if the bucket is momentarily empty. */
  async take(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000);
    await this.sleep(waitMs);
    return this.take();
  }
}

const bucket = new TokenBucket(
  intEnv("CONGRESS_RATE_BURST", 1000),
  intEnv("CONGRESS_RATE_PER_MIN", 60) / 60,
);

/**
 * `fetch` for Congress.gov, gated by the shared token bucket. Every Congress.gov
 * request in the app goes through here so bulk warming and floods self-pace under
 * the 5,000/hr key quota. Signature mirrors `fetch`.
 */
export async function congressFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  await bucket.take();
  return fetch(input, init);
}
