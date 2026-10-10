import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Item = { id: string; name: string; slug: string; price_cents: number; status: string };

const STATUS_TINT: Record<string, string> = {
  active: "bg-[color:var(--color-sage-tint)] text-[color:var(--color-sage-ink)]",
  draft: "bg-[color:var(--color-surface-sink)] text-[color:var(--color-muted)]",
  archived: "bg-[color:var(--color-warn-tint)] text-[color:var(--color-warn-ink)]",
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ItemsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, name, slug, price_cents, status")
    .order("created_at", { ascending: false });
  const items = (data as Item[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Items</p>
          <h1 className="mt-1 text-3xl font-semibold">Your items</h1>
        </div>
        <Link href="/dashboard/items/new" className="btn btn-primary">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add item
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-[color:var(--color-muted)]">
          No items yet. Create your first one.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-surface-sink)]">
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/items/${it.id}`} className="font-medium hover:underline">
                      {it.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{money(it.price_cents)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_TINT[it.status] ?? ""}`}>
                      {it.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
