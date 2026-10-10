import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ONE browser client, reused. Creating a fresh createBrowserClient() per call
 * races on refresh-token rotation and produces random 401s on authed writes
 * (STANDARDS: "one browser client, singleton"). Never call createBrowserClient
 * inside a component/hook body.
 */
let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}
