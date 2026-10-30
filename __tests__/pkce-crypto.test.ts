const { createHash, randomFillSync } = require("node:crypto");
import { createClient } from "@supabase/supabase-js";
import { installPkceCrypto } from "@/features/sync/pkce-crypto";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomValues: jest.fn((bytes) => require("node:crypto").randomFillSync(bytes)),
  digest: jest.fn(async (_algorithm, bytes) => {
    const result = require("node:crypto").createHash("sha256").update(new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength)).digest();
    return Uint8Array.from(result).buffer;
  }),
}));

test("native crypto adapter makes the installed Supabase SDK emit S256, not a plaintext verifier", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    installPkceCrypto();
    const rows = new Map<string, string>();
    const client = createClient("https://example.supabase.co", "test-key", { auth: {
      flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => { rows.set(k, v); }, removeItem: (k) => { rows.delete(k); } },
    } });
    const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: {
      skipBrowserRedirect: true, redirectTo: "javbudget:///?oauth_state=test-attempt",
    } });
    expect(error).toBeNull();
    const url = new URL(data.url!);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    const entry = [...rows.entries()].find(([key]) => key.includes(`-flow-${data.flowId}-code-verifier`));
    expect(entry).toBeDefined();
    const verifier = JSON.parse(entry![1]) as string;
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(url.toString()).not.toContain(verifier);
    expect(require("expo-crypto").getRandomValues).toHaveBeenCalled();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("existing WebCrypto primitives are preserved", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const existing = { getRandomValues: randomFillSync, subtle: { digest: jest.fn() } };
  Object.defineProperty(globalThis, "crypto", { value: existing, configurable: true });
  try { installPkceCrypto(); expect(globalThis.crypto).toBe(existing); expect(globalThis.crypto.subtle.digest).toBe(existing.subtle.digest); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
