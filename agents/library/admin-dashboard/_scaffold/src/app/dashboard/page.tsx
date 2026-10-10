import { Boxes, CheckCircle2, PencilLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrafficPanel, type TrafficStats } from "@/components/dashboard/traffic-panel";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();

  const [total, active, drafts, trafficRes] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.rpc("site_traffic_stats"),
  ]);

  const traffic = (trafficRes.data as TrafficStats | null) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Overview</p>
        <h1 className="mt-1 text-3xl font-semibold">At a glance</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total items" value={total.count ?? 0} icon={Boxes} href="/dashboard/items" />
        <StatCard label="Active" value={active.count ?? 0} icon={CheckCircle2} />
        <StatCard label="Drafts" value={drafts.count ?? 0} icon={PencilLine} />
      </div>

      <TrafficPanel initial={traffic} />
    </div>
  );
}
