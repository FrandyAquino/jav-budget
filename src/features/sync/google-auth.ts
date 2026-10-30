import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "expo-crypto";
import { openAuthSessionAsync } from "expo-web-browser";
import { googleCallbackCode } from "./google-callback";

export const hasGoogleCallback = () => false;
export async function finishGoogleSignIn(_client: SupabaseClient): Promise<void> {}

export async function beginGoogleSignIn(client: SupabaseClient): Promise<boolean> {
  const redirect = `javbudget:///?oauth_state=${randomUUID()}`;
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirect, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google authorization unavailable");
  const result = await openAuthSessionAsync(data.url, redirect);
  if (result.type !== "success") return false;
  const code = googleCallbackCode(result.url, redirect);
  const exchanged = await client.auth.exchangeCodeForSession(code, data.flowId ? { flowId: data.flowId } : undefined);
  if (exchanged.error) throw exchanged.error;
  if (!exchanged.data.session) throw new Error("Google session unavailable");
  return true;
}
