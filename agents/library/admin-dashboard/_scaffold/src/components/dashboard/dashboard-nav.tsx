"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Boxes, TrendingUp, Settings, ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavLink = { href: string; label: string; icon: LucideIcon; exact?: boolean };

// Daily workflow.
const PRIMARY: NavLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/items", label: "Items", icon: Boxes },
];
// Grow & manage — behind a divider so the nav stays clean as it grows.
const MANAGE: NavLink[] = [
  { href: "/dashboard/insights", label: "Insights", icon: TrendingUp },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({ link, pathname }: { link: NavLink; pathname: string }) {
  const { href, label, icon: Icon, exact } = link;
  const active = isActive(pathname, href, exact);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[color:var(--color-primary-tint)] text-[color:var(--color-primary-ink)]"
          : "text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-sink)] hover:text-[color:var(--color-ink)]"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Dashboard">
      {PRIMARY.map((l) => <NavItem key={l.href} link={l} pathname={pathname} />)}
      <hr className="my-2 border-[color:var(--color-border)]" />
      {MANAGE.map((l) => <NavItem key={l.href} link={l} pathname={pathname} />)}
    </nav>
  );
}

export function DashboardSidebar({ appName }: { appName: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] lg:flex">
      <div className="flex h-16 items-center border-b border-[color:var(--color-border)] px-5 font-semibold">
        {appName}
      </div>
      <div className="flex-1 overflow-y-auto p-4"><NavLinks /></div>
      <div className="border-t border-[color:var(--color-border)] p-4">
        <Link href="/" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-sink)] hover:text-[color:var(--color-ink)]">
          <ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" /> View site
        </Link>
      </div>
    </aside>
  );
}

export function DashboardTopbar({ appName, userEmail }: { appName: string; userEmail: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-4 backdrop-blur-sm sm:px-6">
      <span className="font-semibold lg:hidden">{appName}</span>
      <span className="hidden lg:block text-sm text-[color:var(--color-muted)]">Control center</span>
      {userEmail && <span className="text-sm text-[color:var(--color-muted)]" title={userEmail}>{userEmail}</span>}
    </header>
  );
}
