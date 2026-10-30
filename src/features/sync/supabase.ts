// Supabase client for iOS/Android, per the Expo quickstart:
// https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native
import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";
import { AppState } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, syncConfigured } from "./config";
import { createSessionStorage } from "./session-storage";
import { installPkceCrypto } from "./pkce-crypto";

installPkceCrypto();

let client: SupabaseClient | null | undefined;
// null when cloud sync isn't configured for this build.
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!syncConfigured) return (client = null);
  const created = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: createSessionStorage(localStorage),
      autoRefreshToken: true,
      persistSession: true,
      flowType: "pkce", detectSessionInUrl: false,
    },
  });
  // React Native can't tell whether the app is focused: refresh the session
  // only while it is in the foreground (registered once).
  AppState.addEventListener("change", (state) => {
    if (state === "active") void created.auth.startAutoRefresh();
    else void created.auth.stopAutoRefresh();
  });
  return (client = created);
}
