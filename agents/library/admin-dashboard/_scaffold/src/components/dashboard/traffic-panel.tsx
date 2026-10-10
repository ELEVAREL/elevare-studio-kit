"use client";

import { useEffect, useState } from "react";
import { Radio, Users, MousePointerClick } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type TrafficStats = {
  live: number;
  visitors_today: number;
  views_today: number;
  visitors_30d: number;
  views_30d: number;
};

const POLL_MS = 20_000;

/** Server-seeded live island: polls the admin-only rollup every 20s while
 *  visible. Read-only — viewing the dashboard records no visit. */
export function TrafficPanel({ initial }: { initial: TrafficStats | null }) {
  const [stats, setStats] = useState<TrafficStats | null>(initial);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("site_traffic_stats");
      if (!alive || error || !data) return;
      setStats(data as TrafficStats);
    };
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const live = stats?.live ?? 0;
  const Card = ({ eyebrow, value, sub, icon: Icon, dot }: {
    eyebrow: string; value: number; sub: React.ReactNode; icon: typeof Users; dot?: boolean;
  }) => (
    <div className="card flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="eyebrow flex items-center gap-1.5">
          {dot && (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {live > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-sage-ink)] opacity-70" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${live > 0 ? "bg-[color:var(--color-sage-ink)]" : "bg-[color:var(--color-muted-soft)]"}`} />
            </span>
          )}
          {eyebrow}
        </p>
        <p className="mt-2 text-3xl font-semibold leading-none tabular-nums" aria-live="polite">{value}</p>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{sub}</p>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-surface-sink)] text-[color:var(--color-muted)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
  );

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Radio className="h-[18px] w-[18px] text-[color:var(--color-sage-ink)]" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Live traffic</h2>
        <span className="text-xs text-[color:var(--color-muted)]">updates automatically</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card eyebrow="Live now" value={live} icon={Radio} dot
          sub={`${live === 1 ? "person" : "people"} on your site right now`} />
        <Card eyebrow="Visitors today" value={stats?.visitors_today ?? 0} icon={Users}
          sub={<><span className="tabular-nums">{stats?.visitors_30d ?? 0}</span> in the last 30 days</>} />
        <Card eyebrow="Website clicks today" value={stats?.views_today ?? 0} icon={MousePointerClick}
          sub={<><span className="tabular-nums">{stats?.views_30d ?? 0}</span> in the last 30 days</>} />
      </div>
    </section>
  );
}
