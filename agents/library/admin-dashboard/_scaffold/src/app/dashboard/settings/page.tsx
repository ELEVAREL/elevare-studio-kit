export const dynamic = "force-dynamic";

// Stub. Back this with a single settings row (jsonb blob) and a Server Action
// that MERGES rather than replaces the blob (STANDARDS / settings-architecture).
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold">Settings</h1>
      </div>
      <div className="card p-10 text-center text-[color:var(--color-muted)]">
        Add a settings table + a merge-not-replace Server Action here.
      </div>
    </div>
  );
}
