import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** The one metric tile behind every number on every dashboard page. */
export function StatCard({
  label, value, hint, icon: Icon, href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
}) {
  const inner = (
    <div className="card flex items-start justify-between gap-3 p-5 transition-shadow hover:shadow-sm">
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="mt-2 text-3xl font-semibold leading-none tabular-nums">{value}</p>
        {hint && <p className="mt-2 text-sm text-[color:var(--color-muted)]">{hint}</p>}
      </div>
      {Icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-surface-sink)] text-[color:var(--color-muted)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-[color:var(--color-primary)]">
      {inner}
    </Link>
  ) : inner;
}
