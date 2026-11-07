import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <h1 className="font-display text-5xl font-bold tracking-tight">MedMimic</h1>
      <p className="max-w-md text-muted">
        Interview an AI patient, make decisions, then rewind a critical moment and see
        how one sentence changes the outcome.
      </p>
      <Link
        href="/briefing"
        className="inline-flex min-h-11 items-center rounded-xl bg-ok px-6 font-bold text-[#062012] hover:brightness-110"
      >
        Start a case
      </Link>
      <p className="text-xs text-faint">
        Fictional patients. For education only, not clinical decision-making.
      </p>
    </main>
  );
}
