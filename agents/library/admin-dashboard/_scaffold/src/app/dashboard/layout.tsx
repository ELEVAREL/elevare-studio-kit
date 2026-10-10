import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar, DashboardTopbar } from "@/components/dashboard/dashboard-nav";

/** Gated shell. The proxy already redirects unauthenticated users; this
 *  re-checks admin server-side (defense in depth). */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) redirect("/login");

  const appName = "Acme";

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar appName={appName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar appName={appName} userEmail={user.email ?? null} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
