export const dynamic = "force-dynamic";

// Stub. Build this out per the blueprint's Insights module (derive top items,
// most-viewed, conversion, price-raise recommendations from your data).
export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Insights</p>
        <h1 className="mt-1 text-3xl font-semibold">Insights</h1>
      </div>
      <div className="card p-10 text-center text-[color:var(--color-muted)]">
        Wire this up to your sales/views data — see the blueprint&rsquo;s Insights module.
      </div>
    </div>
  );
}
