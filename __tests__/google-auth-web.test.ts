import type { SupabaseClient } from "@supabase/supabase-js";

const key = "jav-budget.google-attempt.v1";
const origin = "https://jav-budget.expo.app";
const redirect = `${origin}/?oauth_state=attempt-123`;
const exchange = jest.fn(async () => ({ data: { session: { user: { id: "google-user" } } }, error: null }));
const client = { auth: { exchangeCodeForSession: exchange } } as unknown as SupabaseClient;
let auth: typeof import("@/features/sync/google-auth.web");
const entries = new Map<string, string>();
const originals = new Map<string, PropertyDescriptor | undefined>();
const replaceState = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  entries.clear();
  entries.set(key, JSON.stringify({ redirect, at: Date.now() }));
  for (const [name, value] of Object.entries({
    location: { href: `${redirect}&code=valid`, origin },
    history: { replaceState },
    sessionStorage: { getItem: (k: string) => entries.get(k) ?? null, removeItem: (k: string) => entries.delete(k) },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  jest.isolateModules(() => { auth = require("@/features/sync/google-auth.web"); });
});
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test("web callback exchanges once, consumes the pending attempt and removes the code from history", async () => {
  await Promise.all([auth.finishGoogleSignIn(client), auth.finishGoogleSignIn(client)]);
  expect(exchange).toHaveBeenCalledTimes(1);
  expect(exchange).toHaveBeenCalledWith("valid", undefined);
  expect(entries.has(key)).toBe(false);
  expect(replaceState).toHaveBeenCalledWith(null, "", "/");
});

test.each(["absent", "expired", "mismatched"])("web rejects a %s pending attempt", async (kind) => {
  if (kind === "absent") entries.clear();
  if (kind === "expired") entries.set(key, JSON.stringify({ redirect, at: Date.now() - 11 * 60 * 1000 }));
  if (kind === "mismatched") entries.set(key, JSON.stringify({ redirect: `${origin}/?oauth_state=another`, at: Date.now() }));
  await expect(auth.finishGoogleSignIn(client)).rejects.toThrow();
  expect(exchange).not.toHaveBeenCalled();
  expect(entries.has(key)).toBe(false);
  expect(replaceState).toHaveBeenCalled();
});
