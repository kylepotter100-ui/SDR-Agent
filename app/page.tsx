export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-medium">KP SDR Agent</h1>
      <p className="mt-2 text-sm text-gray-600">
        Backend agent. The Phase 1 pipeline runs via cron — see{" "}
        <code>app/api/cron/</code>. No web UI until Phase 2.
      </p>
    </main>
  );
}
