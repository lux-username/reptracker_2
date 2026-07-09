import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rate-limit";

/** A controllable clock so refill timing is deterministic (no real waits). */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TokenBucket", () => {
  it("starts full and grants tokens immediately until drained", async () => {
    const clk = fakeClock();
    const b = new TokenBucket(3, 1, clk.now, async () => {});
    expect(b.available()).toBe(3);
    await b.take();
    await b.take();
    await b.take();
    expect(b.available()).toBe(0);
  });

  it("refills at the configured rate, capped at capacity", async () => {
    const clk = fakeClock();
    const b = new TokenBucket(5, 2, clk.now, async () => {}); // 2 tokens/sec
    for (let i = 0; i < 5; i++) await b.take();
    expect(b.available()).toBe(0);
    clk.advance(1000);
    expect(b.available()).toBe(2);
    clk.advance(10_000);
    expect(b.available()).toBe(5); // never exceeds capacity
  });

  it("waits just long enough for a token when momentarily empty, then proceeds", async () => {
    const clk = fakeClock();
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      clk.advance(ms);
    };
    const b = new TokenBucket(1, 1, clk.now, sleep); // 1 token/sec
    await b.take(); // immediate; bucket now empty
    await b.take(); // empty → waits ~1s for one token, then proceeds
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBe(1000);
    expect(b.available()).toBe(0);
  });
});
