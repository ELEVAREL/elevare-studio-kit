"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Public-site traffic tracker: one pageview per navigation + a heartbeat ping
 * every 25s so a visitor idling on one page still counts as live. Excludes
 * owner/auth routes so the operator never pollutes their own numbers. Mount
 * once in the root layout. Renders nothing.
 */
const EXCLUDE = ["/dashboard", "/login", "/account"];
const HEARTBEAT_MS = 25_000;

function sessionId(): string {
  try {
    let id = localStorage.getItem("sid");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("sid", id); }
    return id;
  } catch { return ""; }
}

export function SiteTracker() {
  const pathname = usePathname();
  const excluded = EXCLUDE.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (excluded) return;
    const sid = sessionId();
    if (!sid) return;
    createClient().rpc("record_site_visit", { p_session: sid, p_path: pathname }).then(() => {}, () => {});
  }, [pathname, excluded]);

  useEffect(() => {
    if (excluded) return;
    const sid = sessionId();
    if (!sid) return;
    const supabase = createClient();
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      supabase.rpc("record_site_visit", { p_session: sid, p_path: null }).then(() => {}, () => {});
    };
    const timer = setInterval(ping, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", ping); };
  }, [excluded]);

  return null;
}
