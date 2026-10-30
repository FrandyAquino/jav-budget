import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeErrorEvent } from "../src/shared/monitoring/sanitize.ts";

test("crash reports omit credentials and financial data from all free-form context", () => {
  const secret = "private-financial-value";
  const result = sanitizeErrorEvent({
    event_id: "event", release: "1.0", message: secret,
    user: { email: secret }, request: { url: secret }, extra: { amount: secret },
    contexts: { custom: { value: secret } }, tags: { custom: secret },
    breadcrumbs: [{ message: secret }],
    exception: { values: [{ type: secret, value: secret, stacktrace: { frames: [{
      filename: `app:///index.js?token=${secret}`, function: secret,
      vars: { secret }, context_line: secret, lineno: 42, colno: 2,
    }] } }] },
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.exception?.values?.[0].stacktrace?.frames?.[0].lineno, 42);
  assert.equal(result.exception?.values?.[0].stacktrace?.frames?.[0].filename, "index.js");
});
