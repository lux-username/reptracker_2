import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake for @upstash/redis covering the counter ops the abuse guard
// uses (incr, incrby, expire). `fail` forces the graceful-degradation path.
const h = vi.hoisted(() => ({
  store: new Map<string, number>(),
  state: { fail: false },
}));

vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(_opts: unknown) {}
    async incr(key: string): Promise<number> {
      if (h.state.fail) throw new Error("boom");
      const next = (h.store.get(key) ?? 0) + 1;
      h.store.set(key, next);
      return next;
    }
    async incrby(key: string, by: number): Promise<number> {
      if (h.state.fail) throw new Error("boom");
      const next = (h.store.get(key) ?? 0) + by;
      h.store.set(key, next);
      return next;
    }
    async expire(_key: string, _ttl: number): Promise<number> {
      return 1;
    }
  }
  return { Redis };
});

import {
  checkRateLimit,
  reserveGeocodeCredits,
  GEOCODIO_CREDITS_PER_CALL,
} from "./abuse-guard";

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

function enable() {
  process.env[URL_ENV] = "https://fake.upstash.io";
  process.env[TOKEN_ENV] = "fake-token";
}
function disable() {
  delete process.env[URL_ENV];
  delete process.env[TOKEN_ENV];
}

const T0 = 1_700_000_000_000; // fixed clock

beforeEach(() => {
  h.store.clear();
  h.state.fail = false;
  enable();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  disable();
  vi.restoreAllMocks();
});

describe("checkRateLimit — per-minute window", () => {
  it("allows up to the limit then rejects on the minute window", async () => {
    const cfg = { perMinute: 3, perDay: 100 };
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit("1.2.3.4", T0, cfg)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit("1.2.3.4", T0, cfg);
    expect(blocked.allowed).toBe(false);
    expect(blocked.window).toBe("minute");
  });

  it("resets when the minute bucket rolls over", async () => {
    const cfg = { perMinute: 1, perDay: 100 };
    expect((await checkRateLimit("1.2.3.4", T0, cfg)).allowed).toBe(true);
    expect((await checkRateLimit("1.2.3.4", T0, cfg)).allowed).toBe(false);
    // +61s → new minute bucket
    expect((await checkRateLimit("1.2.3.4", T0 + 61_000, cfg)).allowed).toBe(true);
  });

  it("isolates counters per IP", async () => {
    const cfg = { perMinute: 1, perDay: 100 };
    expect((await checkRateLimit("1.1.1.1", T0, cfg)).allowed).toBe(true);
    expect((await checkRateLimit("2.2.2.2", T0, cfg)).allowed).toBe(true);
  });
});

describe("checkRateLimit — per-day window", () => {
  it("rejects on the day window even across different minutes", async () => {
    const cfg = { perMinute: 100, perDay: 2 };
    expect((await checkRateLimit("9.9.9.9", T0, cfg)).allowed).toBe(true);
    expect((await checkRateLimit("9.9.9.9", T0 + 61_000, cfg)).allowed).toBe(true);
    const blocked = await checkRateLimit("9.9.9.9", T0 + 122_000, cfg);
    expect(blocked.allowed).toBe(false);
    expect(blocked.window).toBe("day");
  });
});

describe("checkRateLimit — graceful degradation", () => {
  it("allows when no Redis is configured", async () => {
    disable();
    const cfg = { perMinute: 1, perDay: 1 };
    expect((await checkRateLimit("1.2.3.4", T0, cfg)).allowed).toBe(true);
    expect((await checkRateLimit("1.2.3.4", T0, cfg)).allowed).toBe(true);
  });

  it("allows when Redis throws", async () => {
    h.state.fail = true;
    const cfg = { perMinute: 1, perDay: 1 };
    expect((await checkRateLimit("1.2.3.4", T0, cfg)).allowed).toBe(true);
  });

  it("buckets empty IPs under a shared 'unknown' key", async () => {
    const cfg = { perMinute: 1, perDay: 100 };
    expect((await checkRateLimit("", T0, cfg)).allowed).toBe(true);
    expect((await checkRateLimit("   ", T0, cfg)).allowed).toBe(false); // same bucket
  });
});

describe("reserveGeocodeCredits — daily circuit breaker", () => {
  it("allows spend up to the cap then blocks", async () => {
    // cap 6, 2 credits/call → 3 calls fit, 4th blocked
    expect(await reserveGeocodeCredits(2, T0, 6)).toBe(true);
    expect(await reserveGeocodeCredits(2, T0, 6)).toBe(true);
    expect(await reserveGeocodeCredits(2, T0, 6)).toBe(true);
    expect(await reserveGeocodeCredits(2, T0, 6)).toBe(false);
  });

  it("rolls over to a fresh budget on the next UTC day", async () => {
    expect(await reserveGeocodeCredits(2, T0, 2)).toBe(true);
    expect(await reserveGeocodeCredits(2, T0, 2)).toBe(false);
    // +1 day
    expect(await reserveGeocodeCredits(2, T0 + 86_400_000, 2)).toBe(true);
  });

  it("defaults to 2 credits per call", async () => {
    expect(await reserveGeocodeCredits(undefined, T0, 3)).toBe(true); // spends 2
    expect(GEOCODIO_CREDITS_PER_CALL).toBe(2);
    expect(await reserveGeocodeCredits(undefined, T0, 3)).toBe(false); // 4 > 3
  });

  it("degrades to allow when no Redis is configured", async () => {
    disable();
    expect(await reserveGeocodeCredits(2, T0, 0)).toBe(true);
  });

  it("degrades to allow when Redis throws", async () => {
    h.state.fail = true;
    expect(await reserveGeocodeCredits(2, T0, 0)).toBe(true);
  });
});
