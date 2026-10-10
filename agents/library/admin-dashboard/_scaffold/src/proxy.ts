import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy` (same
 * before-request hook). Refreshes the session cookies and guards /dashboard.
 * On Next 15 or earlier, rename this file to `middleware.ts` and export
 * `middleware` instead of `proxy`.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/login"],
};
