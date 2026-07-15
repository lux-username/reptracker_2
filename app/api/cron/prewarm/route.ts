// Nightly pre-warm cron (Issue #16). Vercel Cron hits this once a day (Hobby is
// daily-only); it warms the Upstash caches — shared committee data, every
// jurisdiction's member list, a convergent slice of per-member contacts — and
// refreshes the full upcoming-events index so the common visit is a warm hit.
//
// Auth: when CRON_SECRET is set, Vercel sends it as `Authorization: Bearer …`
// and we reject anything else, so the (uncached, quota-spending) route can't be
// triggered by the public. Budgets are env-tunable to stay under the ~60s Hobby
// function ceiling; the response echoes what each pass covered (no silent caps).
import { NextResponse } from "next/server";
import { prewarm } from "@/lib/prewarm";

// Uncached, and it may run close to the Hobby function ceiling.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unset (e.g. local dev) → open; set it in prod
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function intEnv(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const stats = await prewarm({
      now: startedAt,
      concurrency: intEnv("PREWARM_CONCURRENCY"),
      contactBudget: intEnv("PREWARM_CONTACT_BUDGET"),
      eventsDetailBudget: intEnv("PREWARM_DETAIL_BUDGET"),
      docketBudget: intEnv("PREWARM_DOCKET_BUDGET"),
    });
    const elapsedMs = Date.now() - startedAt.getTime();
    return NextResponse.json({ ok: true, elapsedMs, ...stats });
  } catch (e) {
    console.error(`[cron/prewarm] failed: ${String(e)}`);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
