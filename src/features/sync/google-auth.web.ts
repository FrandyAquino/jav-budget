import type { SupabaseClient } from "@supabase/supabase-js";
import { googleCallbackCode } from "./google-callback";

const PENDING = "jav-budget.google-attempt.v1";
const MAX_AGE = 10 * 60 * 1000;
export const hasGoogleCallback = () => typeof window !== "undefined" &&
  new URL(window.location.href).searchParams.has("oauth_state");
let completing: Promise<void> | undefined;

export function finishGoogleSignIn(client: SupabaseClient): Promise<void> {
  if (completing) return completing;
  if (!hasGoogleCallback()) return Promise.resolve();
  completing = (async () => {
    const callback = window.location.href;
    const raw = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    // Never leave the authorization code in browser history, even on failure.
    window.history.replaceState(null, "", "/");
    if (!raw) throw new Error("No Google sign-in in progress");
    const attempt = JSON.parse(raw) as { redirect: string; at: number; flowId?: string };
    if (!Number.isFinite(attempt.at) || Date.now() - attempt.at > MAX_AGE || attempt.at > Date.now())
      throw new Error("Google sign-in expired");
    const expected = new URL(attempt.redirect);
    if (expected.origin !== window.location.origin || expected.pathname !== "/")
      throw new Error("Invalid Google redirect");
    const code = googleCallbackCode(callback, attempt.redirect);
    const { data, error } = await client.auth.exchangeCodeForSession(code, attempt.flowId ? { flowId: attempt.flowId } : undefined);
    if (error) throw error;
    if (!data.session) throw new Error("Google session unavailable");
  })();
  return completing;
}

export async function beginGoogleSignIn(client: SupabaseClient): Promise<boolean> {
  const redirect = `${window.location.origin}/?oauth_state=${window.crypto.randomUUID()}`;
  sessionStorage.setItem(PENDING, JSON.stringify({ redirect, at: Date.now() }));
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
    });
    if (error) throw error;
    if (!data.url) throw new Error("Google authorization unavailable");
    sessionStorage.setItem(PENDING, JSON.stringify({ redirect, at: Date.now(), flowId: data.flowId }));
    window.location.assign(data.url);
    return false; // The new page completes the exchange.
  } catch (error) {
    sessionStorage.removeItem(PENDING);
    throw error;
  }
}
