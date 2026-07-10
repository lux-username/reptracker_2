import AddressLookup from "./AddressLookup";
import FloorThisWeek from "./FloorThisWeek";
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
      className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16 focus:outline-none"
    >
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Representative Tracker
        </h1>
        <p className="text-lg text-slate-600">
          Enter your address to see the upcoming decisions your federal
          representatives are about to make — in time to act.
        </p>
      </header>
      <AddressLookup session={session} />
      <FloorThisWeek data={floor} session={session} />
    </main>
  );
}
