import { test } from "node:test";
import assert from "node:assert/strict";
import { emailLinkToken } from "../src/features/sync/email-link.ts";

const project = "https://example.supabase.co";
test("email links accept only this project's sign-in verification tokens", () => {
  for (const type of ["signup", "magiclink", "email"])
    assert.equal(emailLinkToken(`${project}/auth/v1/verify?token=valid_hash&type=${type}&redirect_to=https://elsewhere.test`, project), "valid_hash");
});
test("email links reject foreign hosts, credentials, recovery and malformed input", () => {
  for (const input of [
    "not a URL", "123456", `${project}/auth/v1/verify?type=magiclink`,
    "https://other.supabase.co/auth/v1/verify?token=hash&type=magiclink",
    "https://example.supabase.co.evil.test/auth/v1/verify?token=hash&type=magiclink",
    "https://user@example.supabase.co/auth/v1/verify?token=hash&type=magiclink",
    `${project}/auth/v1/verify?token=hash&type=recovery`,
    `${project}/auth/v1/verify?token=hash&type=invite`,
    `${project}/other?token=hash&type=magiclink`,
  ]) assert.equal(emailLinkToken(input, project), null);
});
