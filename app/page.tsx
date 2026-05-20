import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-medium">KP SDR Agent</h1>
      <p className="mt-2 text-sm text-gray-600">
        Autonomous prospecting agent for KP Solutions. The weekly pipeline
        runs via cron; the dashboard tracks the pipeline.
      </p>
      <Link
        href="/dashboard"
        className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline"
      >
        Log in to the dashboard →
      </Link>
    </main>
  );
}
