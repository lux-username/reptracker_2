import { describe, expect, it } from "vitest";
import {
  assertUnderDailyCap,
  estimateCallCostUSD,
  recordSpend,
  spendDayKey,
  SpendCapError,
} from "./anthropic";
import { MemoryCache } from "./cache";

describe("estimateCallCostUSD", () => {
  it("prices input at $1/MTok and output at $5/MTok", () => {
    // 1M input + 1M output = $1 + $5.
    expect(estimateCallCostUSD({ input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(6);
  });
  it("counts cache tokens at the input rate (conservative)", () => {
    expect(
      estimateCallCostUSD({ input_tokens: 500_000, cache_read_input_tokens: 500_000, output_tokens: 0 }),
    ).toBeCloseTo(1);
  });
  it("a typical summary call is well under a cent", () => {
    expect(estimateCallCostUSD({ input_tokens: 655, output_tokens: 55 })).toBeLessThan(0.01);
  });
});

describe("spendDayKey", () => {
  it("buckets by UTC date", () => {
    expect(spendDayKey(new Date("2026-07-08T23:59:00Z"))).toBe("spend:2026-07-08");
  });
});

describe("daily spend cap", () => {
  it("allows calls under the cap and records accumulating spend", async () => {
    const cache = new MemoryCache();
    const key = "spend:2026-07-08";
    await assertUnderDailyCap(cache, key, 5); // 0 spent — fine
    await recordSpend(cache, key, 1.5);
    await recordSpend(cache, key, 2.0);
    expect(Number(await cache.get(key))).toBeCloseTo(3.5);
    await assertUnderDailyCap(cache, key, 5); // still under
  });

  it("refuses once spend reaches the cap", async () => {
    const cache = new MemoryCache();
    const key = "spend:2026-07-08";
    await recordSpend(cache, key, 5.0);
    await expect(assertUnderDailyCap(cache, key, 5)).rejects.toThrow(SpendCapError);
  });
});
