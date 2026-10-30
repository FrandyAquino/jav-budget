// Accept authorization codes only for the callback created by this attempt.
// PKCE additionally binds the exchange to the verifier held by this client.
export function googleCallbackCode(value: string, redirect: string): string {
  const url = new URL(value);
  const expected = new URL(redirect);
  if (url.protocol !== expected.protocol || url.host !== expected.host ||
      url.pathname !== expected.pathname || url.username || url.password || url.hash ||
      !expected.searchParams.get("oauth_state") ||
      url.searchParams.getAll("oauth_state").length !== 1 ||
      url.searchParams.get("oauth_state") !== expected.searchParams.get("oauth_state") ||
      url.searchParams.has("error") || url.searchParams.getAll("code").length !== 1)
    throw new Error("Invalid Google callback");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) throw new Error("Invalid Google code");
  return code;
}
