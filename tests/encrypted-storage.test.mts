import { test } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { encryptedStorage } from "../src/features/sync/encrypted-storage.ts";

function fixture() {
  const values = new Map<string, string>();
  const secret = randomBytes(32);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const cipher = {
    async seal(value: string, context: string) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", secret, iv);
      c.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([c.update(value, "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), encrypted]).toString("base64");
    },
    async open(value: string, context: string) {
      const bytes = Buffer.from(value, "base64");
      const c = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
      c.setAAD(Buffer.from(context));
      c.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([c.update(bytes.subarray(28)), c.final()]).toString("utf8");
    },
  };
  return { values, storage, cipher, auth: encryptedStorage(storage, cipher) };
}
test("session migration commits ciphertext before removing plaintext; large Unicode values round-trip", async () => {
  const f = fixture();
  const token = JSON.stringify({ refresh_token: "sensitive", name: "José 🛡".repeat(1000) });
  f.values.set("session", token);
  assert.equal(await f.auth.getItem("session"), token);
  assert.equal(f.values.has("session"), false);
  assert.ok(!f.values.get("encrypted:v1:session")!.includes("sensitive"));
  assert.equal(await f.auth.getItem("session"), token);
  await f.auth.removeItem("session");
  assert.equal(await f.auth.getItem("session"), null);
});
test("failed encryption leaves the legacy session intact and propagates the error", async () => {
  const f = fixture();
  f.values.set("session", "legacy");
  f.cipher.seal = async () => { throw new Error("Keychain unavailable"); };
  await assert.rejects(f.auth.getItem("session"), /Keychain unavailable/);
  assert.equal(f.values.get("session"), "legacy");
  assert.equal(f.values.size, 1);
});
test("tampered and swapped ciphertext fails closed without legacy fallback", async () => {
  const f = fixture();
  await f.auth.setItem("session", "private");
  f.values.set("encrypted:v1:other", f.values.get("encrypted:v1:session")!);
  f.values.set("other", "stale session");
  assert.equal(await f.auth.getItem("other"), null);
  assert.equal(f.values.has("other"), false);
  f.values.set("encrypted:v1:session", "corrupt");
  assert.equal(await f.auth.getItem("session"), null);
});
