import type { SupabaseClient } from "@supabase/supabase-js";
import { openAuthSessionAsync } from "expo-web-browser";
import { beginGoogleSignIn } from "@/features/sync/google-auth";

jest.mock("expo-crypto", () => ({ randomUUID: () => "attempt-123" }));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
const browser = jest.mocked(openAuthSessionAsync);
const signInWithOAuth = jest.fn(async () => ({ data: { url: "https://example.supabase.co/auth/v1/authorize" }, error: null }));
const exchangeCodeForSession = jest.fn(async () => ({ data: { session: { user: { id: "google-user" } } }, error: null }));
const client = { auth: { signInWithOAuth, exchangeCodeForSession } } as unknown as SupabaseClient;
beforeEach(() => { jest.clearAllMocks(); });

test("Google uses an external auth session and exchanges only its own PKCE callback", async () => {
  browser.mockResolvedValueOnce({ type: "success", url: "javbudget:///?oauth_state=attempt-123&code=valid" });
  expect(await beginGoogleSignIn(client)).toBe(true);
  expect(signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: {
    redirectTo: "javbudget:///?oauth_state=attempt-123", skipBrowserRedirect: true, queryParams: { prompt: "select_account" },
  } });
  expect(exchangeCodeForSession).toHaveBeenCalledWith("valid", undefined);
});

test("cancelling Google leaves the session unchanged", async () => {
  browser.mockResolvedValueOnce({ type: "cancel" } as Awaited<ReturnType<typeof openAuthSessionAsync>>);
  expect(await beginGoogleSignIn(client)).toBe(false);
  expect(exchangeCodeForSession).not.toHaveBeenCalled();
});

test("another attempt or an injected token never reaches the session exchange", async () => {
  browser.mockResolvedValueOnce({ type: "success", url: "javbudget:///?oauth_state=other&code=valid" });
  await expect(beginGoogleSignIn(client)).rejects.toThrow();
  expect(exchangeCodeForSession).not.toHaveBeenCalled();
});
