import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake for @upstash/redis, with per-test controls hoisted above the mock.
const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  state: { failGet: false, failSet: false, getCalls: 0, setCalls: 0 },
}));

vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(_opts: unknown) {}
    async get<T>(key: string): Promise<T | null> {
      h.state.getCalls++;
      if (h.state.failGet) throw new Error("boom-get");
      return h.store.has(key) ? (h.store.get(key) as T) : null;
    }
    async set(key: string, value: unknown, _opts: unknown) {
      h.state.setCalls++;
      if (h.state.failSet) throw new Error("boom-set");
      h.store.set(key, value);
      return "OK";
    }
  }
  return { Redis };
});

import { cached, cacheKey } from "./cache";

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

beforeEach(() => {
  h.store.clear();
  h.state.failGet = false;
  h.state.failSet = false;
  h.state.getCalls = 0;
  h.state.setCalls = 0;
  // Silence the graceful-degradation warnings the failure tests intentionally trigger.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  disable();
  vi.restoreAllMocks();
});

describe("cacheKey", () => {
  it("namespaces + versions the key from its parts", () => {
    expect(cacheKey("geo", "topeka ks")).toBe("rt:v1:geo:topeka ks");
    expect(cacheKey("members", 119, "KS")).toBe("rt:v1:members:119:KS");
  });
});

describe("cached — disabled (no Upstash creds)", () => {
  beforeEach(disable);

  it("calls the loader every time and never touches Redis", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    expect(await cached("k", 10, loader)).toBe("v");
    expect(await cached("k", 10, loader)).toBe("v");
    expect(loader).toHaveBeenCalledTimes(2); // no caching when disabled
    expect(h.state.getCalls).toBe(0);
    expect(h.state.setCalls).toBe(0);
  });

  it("propagates a loader throw", async () => {
    await expect(
      cached("k", 10, () => Promise.reject(new Error("nope"))),
    ).rejects.toThrow("nope");
  });
});

describe("cached — enabled", () => {
  beforeEach(enable);

  it("loads + stores on a miss, then serves the hit without reloading", async () => {
    const loader = vi.fn().mockResolvedValue({ n: 1 });
    expect(await cached("k", 10, loader)).toEqual({ n: 1 });
    expect(await cached("k", 10, loader)).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(h.state.setCalls).toBe(1);
  });

  it("degrades to the loader when the Redis read fails", async () => {
    h.state.failGet = true;
    const loader = vi.fn().mockResolvedValue("v");
    expect(await cached("k", 10, loader)).toBe("v");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("returns the value even when the Redis write fails", async () => {
    h.state.failSet = true;
    const loader = vi.fn().mockResolvedValue("v");
    expect(await cached("k", 10, loader)).toBe("v");
  });

  it("never caches a loader throw", async () => {
    await expect(
      cached("k", 10, () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(h.state.setCalls).toBe(0);
    expect(h.store.size).toBe(0);
  });
});
