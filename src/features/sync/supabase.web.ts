// Supabase client for web: the browser's localStorage keeps the session and
// supabase-js refreshes it while the tab is visible.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, syncConfigured } from "./config";

let client: SupabaseClient | null | undefined;
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!syncConfigured || typeof window === "undefined") return null;
  return (client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  }));
}
