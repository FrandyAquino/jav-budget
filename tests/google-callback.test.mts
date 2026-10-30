import { test } from "node:test";
import assert from "node:assert/strict";
import { googleCallbackCode } from "../src/features/sync/google-callback.ts";

for (const base of ["javbudget:///", "https://jav-budget.expo.app/"]) {
  const redirect = `${base}?oauth_state=attempt-123`;
  test(`Google callback validates the exact attempt and destination: ${base}`, () => {
    assert.equal(googleCallbackCode(`${redirect}&code=valid`, redirect), "valid");
    for (const url of [
      `${base}?oauth_state=other&code=valid`,
      `${redirect}&code=one&code=two`, `${redirect}&code=`,
      `${redirect}&code=valid&error=access_denied`,
      `${redirect}&code=valid#access_token=unsafe`,
      `${redirect}&oauth_state=attempt-123&code=valid`,
      `https://evil.example/?oauth_state=attempt-123&code=valid`,
      `${base}unexpected?oauth_state=attempt-123&code=valid`,
      `${base}?code=valid`,
    ]) assert.throws(() => googleCallbackCode(url, redirect));
  });
}
