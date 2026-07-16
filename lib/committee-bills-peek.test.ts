import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitteeDocket } from "./types";

// In-memory fake for @upstash/redis with the `mget` the docket-count peek uses.
const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  state: { fail: false },
}));

vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(_opts: unknown) {}
    async mget<T>(...keys: string[]): Promise<T> {
      if (h.state.fail) throw new Error("boom");
      return keys.map((k) => h.store.get(k) ?? null) as T;
    }
  }
  return { Redis };
});

import { peekDocketCounts } from "./committee-bills";
import { cacheKey } from "./cache";

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";
const CONGRESS = 119;

function docket(systemCode: string, totalReferred: number): CommitteeDocket {
  return { systemCode, totalReferred, bills: [], committeeUrl: "https://x" };
}
function warm(systemCode: string, totalReferred: number) {
  h.store.set(cacheKey("cmte-docket", CONGRESS, systemCode), docket(systemCode, totalReferred));
}

beforeEach(() => {
  h.store.clear();
  h.state.fail = false;
  process.env[URL_ENV] = "https://fake.upstash.io";
  process.env[TOKEN_ENV] = "fake-token";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env[URL_ENV];
  delete process.env[TOKEN_ENV];
  vi.restoreAllMocks();
});

describe("peekDocketCounts", () => {
  it("returns warm counts and omits committees absent from KV", async () => {
    warm("hsag00", 42);
    warm("hsag16", 0);
    // hspw00 deliberately not warmed → should be absent (unknown), not 0.
    const counts = await peekDocketCounts(CONGRESS, ["hsag00", "hsag16", "hspw00"]);
    expect(counts.get("hsag00")).toBe(42);
    expect(counts.get("hsag16")).toBe(0); // a real, known-empty docket
    expect(counts.has("hspw00")).toBe(false); // cold miss stays unknown
  });

  it("dedupes system codes before the mget", async () => {
    warm("ssju00", 7);
    const counts = await peekDocketCounts(CONGRESS, ["ssju00", "ssju00", "ssju00"]);
    expect(counts.get("ssju00")).toBe(7);
    expect(counts.size).toBe(1);
  });

  it("returns an empty map for no input", async () => {
    expect((await peekDocketCounts(CONGRESS, [])).size).toBe(0);
  });

  it("degrades to an empty map (all unknown) when Redis throws", async () => {
    warm("hsag00", 42);
    h.state.fail = true;
    expect((await peekDocketCounts(CONGRESS, ["hsag00"])).size).toBe(0);
  });

  it("degrades to an empty map when no cache is configured", async () => {
    delete process.env[URL_ENV];
    delete process.env[TOKEN_ENV];
    warm("hsag00", 42);
    expect((await peekDocketCounts(CONGRESS, ["hsag00"])).size).toBe(0);
  });
});
