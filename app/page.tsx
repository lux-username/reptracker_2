import AddressLookup from "./AddressLookup";
import FloorThisWeek from "./FloorThisWeek";
import BrandMark from "./BrandMark";
import { getFloorSchedule } from "@/lib/floor-schedule";
import { getSessionStatus } from "@/lib/session-status";

// The floor schedule is scraped/served per request (warm = one KV read); never
// prerendered at build time, where env + upstream may be absent.
export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const floor = await getFloorSchedule(now);
  // Per-chamber recess status (Issue #8), derived from the same floor data plus
  // the cached Senate calendar — no extra network on the warm path.
  const session = await getSessionStatus(now, floor);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 focus:outline-none sm:px-6 sm:py-16"
    >
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0 rounded-lg shadow-sm" />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Representative Tracker
          </h1>
        </div>
        <p className="text-lg leading-relaxed text-slate-600">
          Enter your address to see what your federal representatives are working
          on — the committee action ahead and the bills they&apos;re sponsoring — in
          time to act.
        </p>
      </header>
      <AddressLookup session={session} />
      <FloorThisWeek data={floor} session={session} />
    </main>
  );
}
