import AddressLookup from "./AddressLookup";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Representative Tracker
        </h1>
        <p className="text-lg text-slate-600">
          Enter your address to see the upcoming decisions your federal
          representatives are about to make — in time to act.
        </p>
      </header>
      <AddressLookup />
    </main>
  );
}
