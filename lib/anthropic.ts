// Server-only: the Haiku LLM client for plain-English bill/hearing summaries.
// Reads ANTHROPIC_API_KEY (non-public env var); imported only by server code.
//
// Model verification (spec mandate — never trust the pinned value): re-verified
// against platform.claude.com/docs models overview on 2026-07-08. Current Haiku
// is **claude-haiku-4-5** (pinned `claude-haiku-4-5-20251001`), $1/MTok in,
// $5/MTok out, 200K context, 64K max output. No newer Haiku exists (current
// family: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5). Haiku 4.5 does NOT support
// adaptive thinking or the `effort` param — a 2–3 sentence summary needs
// neither, so we make a plain, un-thinking call.
import Anthropic from "@anthropic-ai/sdk";
import type { KVCache } from "./cache";
import { defaultCache } from "./cache";

/** Verified current Haiku alias (see header). Re-verify at each build. */
export const SUMMARY_MODEL = "claude-haiku-4-5";

// Haiku 4.5 list price (verified 2026-07-08): $1/MTok in, $5/MTok out.
export const HAIKU_INPUT_PER_MTOK = 1;
export const HAIKU_OUTPUT_PER_MTOK = 5;

/**
 * Hard daily spend ceiling enforced at the LLM-client layer (spec → Cost
 * guardrails #1). Crossing it makes the client refuse new calls; callers catch
 * and fall back to structured-only, so the site keeps working. A day is the
 * right window: cost tracks new congressional content (a daily cadence, warmed
 * by the #7 cron), not user traffic. Issue #7 makes the counter Upstash-atomic
 * and adds the per-minute rate limit.
 */
export const DAILY_SPEND_CAP_USD = 5;

/**
 * Neutral, descriptive system prompt (spec → Prompt guardrails / Editorial
 * stance). This is the stable prefix we cache. Kept deliberately factual — a
 * guardrail, not a styling choice; it is checked in code review.
 */
export const SUMMARY_SYSTEM_PROMPT = `You rewrite official U.S. congressional source material into a plain-English summary for constituents.

Rules — these are hard constraints:
- Write 1 to 2 short sentences. Nothing longer.
- Be strictly neutral and descriptive: "The bill would…" / "The hearing will examine…". Describe what the measure does or what the hearing covers.
- Never evaluate, advocate, or use persuasive or emotional framing. Do not say whether the measure is good, bad, needed, controversial, or who benefits or is harmed.
- Use ONLY facts present in the provided source. Do not add specific numbers, dollar amounts, percentages, dates, bill identifiers, member names, or committee names that are not in the source.
- Plain language: de-jargon legislative and procedural terms. No markup, no preamble, no "Here is…". Output only the summary sentences.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new SummaryLLMError("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic();
  }
  return client;
}

export class SummaryLLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SummaryLLMError";
  }
}

/** Thrown when the daily spend cap is already reached — caught → structured-only. */
export class SpendCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapError";
  }
}

/** Dollar cost of one call from its usage. Cache tokens counted at full input
 *  rate — a conservative overestimate (safe for a spending cap). */
export function estimateCallCostUSD(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): number {
  const input =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const output = usage.output_tokens ?? 0;
  return (input / 1e6) * HAIKU_INPUT_PER_MTOK + (output / 1e6) * HAIKU_OUTPUT_PER_MTOK;
}

/** UTC day bucket key, e.g. "spend:2026-07-08". */
export function spendDayKey(now: Date): string {
  return `spend:${now.toISOString().slice(0, 10)}`;
}

/** Refuse if today's recorded spend already meets/exceeds the cap. */
export async function assertUnderDailyCap(
  cache: KVCache,
  dayKey: string,
  cap: number,
): Promise<void> {
  const spent = Number((await cache.get(dayKey)) ?? "0");
  if (spent >= cap) {
    throw new SpendCapError(`daily LLM spend cap of $${cap} reached (spent $${spent.toFixed(2)})`);
  }
}

/** Add one call's cost to today's bucket (26h TTL so it self-expires). */
export async function recordSpend(cache: KVCache, dayKey: string, cost: number): Promise<void> {
  const spent = Number((await cache.get(dayKey)) ?? "0");
  await cache.set(dayKey, String(spent + cost), 26 * 60 * 60);
}

/** A single grounded → plain-English generation. `sourceText` is the only input. */
export type GenerateSummary = (sourceText: string) => Promise<string>;

/**
 * Default generator: one Haiku call. `cache_control` marks the system prompt as
 * the cacheable prefix; note that Haiku's minimum cacheable prefix is 4096
 * tokens, so this small prompt usually won't hit prompt cache — the real cost
 * lever is the per-artifact KV cache in lib/summaries.ts. It's harmless to mark
 * and pays off if the prompt ever grows past the threshold.
 */
export const generateSummary: GenerateSummary = async (sourceText) => {
  const dayKey = spendDayKey(new Date());
  await assertUnderDailyCap(defaultCache, dayKey, DAILY_SPEND_CAP_USD);

  const resp = await getClient().messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 200,
    system: [
      { type: "text", text: SUMMARY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: sourceText }],
  });
  await recordSpend(defaultCache, dayKey, estimateCallCostUSD(resp.usage));

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new SummaryLLMError("Haiku returned no text");
  return text;
};
