# Google sign-in

Implemented locally for iOS, Android and web. Not enabled for real Google accounts yet and not deployed.

## Flow and boundaries

- The sign-in form offers “Continue with Google” as well as the existing email flow.
- Supabase OAuth uses PKCE S256. Native Hermes receives secure randomness and SHA-256 through a narrow Expo Crypto adapter, preventing the SDK's Math.random/plain fallback. The SDK flow ID is retained for the matching verifier slot. Native builds open the system authentication browser; web navigates in the current tab to avoid popup blocking.
- Each attempt includes a random identifier. Callback protocol, host, path and identifier must match. Tokens in URL fragments, duplicate codes and error responses are rejected.
- Web keeps the pending attempt in sessionStorage, expires it after ten minutes, consumes it once, and removes callback parameters from browser history before exchange. The Supabase PKCE verifier is additionally required. Native uses the in-flight browser session; if the process is killed, retry sign-in.
- The existing Supabase user ID remains the data owner. Google access goes through the same account-switch/first-sync gate and RLS. It does not merge ledgers by email or grant access to another user's local data.
- Native sessions and PKCE verifier storage use the encrypted adapter. Google client secrets never belong in EXPO_PUBLIC variables or app code.

## Configuration already applied

Read back from Supabase project `ldhuiyinksudcfpxbuqh`:

- Site URL: `https://jav-budget.expo.app`
- Redirect allow list includes `https://jav-budget.expo.app/?oauth_state=*` and `javbudget:///?oauth_state=*`.
- Existing default email delivery remains unchanged.
- Google is disabled; no Google client ID or secret is configured.

## Required external setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and select or create a Jav Budget project.
2. Configure the app audience/consent screen. Use only basic sign-in scopes (openid, email, profile). In Testing mode, add the accounts that will test login; public availability also requires the appropriate Google publishing/verification steps shown in the console.
3. Create an OAuth client of type **Web application**, including for this browser-based native flow.
4. Authorized JavaScript origin: `https://jav-budget.expo.app`.
5. Authorized redirect URI: `https://ldhuiyinksudcfpxbuqh.supabase.co/auth/v1/callback`.
6. Enter the client ID and secret directly in [Supabase authentication providers](https://supabase.com/dashboard/project/ldhuiyinksudcfpxbuqh/auth/providers), Google, then enable it. Do not paste the secret into chat or commit it.
7. With a configured test Google account, verify login on web and an installed native build, cancellation/retry, force-close/reopen and switching between two accounts. Verify no prior-account ledger appears. Only then publish the app change.

No custom domain purchase is needed. The Google consent flow may display the Supabase project hostname. Expo Go is not the native acceptance-test environment for this app scheme.

## Automated verification

Callback validation tests cover native/web URLs, wrong state/destination, duplicate codes/state, missing code, error and token-fragment injection. Native browser tests cover successful code exchange and cancellation. Web tests cover one-time exchange, history cleanup, missing/expired/mismatched attempts. A UI regression verifies Google cannot expose or upload a retained ledger owned by another account.

These tests mock Google/browser authorization. They do not prove a real Google login until the provider credentials and consent screen exist.

References: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Expo SDK 58 WebBrowser](https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/).

Validation on October 28: lint and TypeScript passed, 130 domain tests passed, 48 UI/SDK tests passed, 11 real Supabase integration tests passed, and web/iOS/Android assets exported. The installed-SDK PKCE test asserts an S256 challenge matching its stored verifier, with native cryptographic primitives mocked. Real Google/browser completion and a native build with this change remain unverified.

Google Cloud was opened in Chrome to complete setup; Google requires the account owner to verify their identity before the console is accessible. Provider activation is blocked on that login and OAuth-client creation, not on a domain purchase.

## Live verification — 2026-10-29

Re-ran lint, TypeScript, all 130 domain tests, 48 UI/SDK tests, and 11 real Supabase integration tests: all passed. The integration suite was skipped by the UI command and run separately, not counted twice.

Served the previously exported local web app on loopback and opened it in Chrome. The signed-out account gate rendered “Continue with Google”. Clicking it navigated to the real Supabase authorization endpoint, which returned HTTP-style error payload `code: 400`, `error_code: validation_failed`, `Unsupported provider: provider is not enabled`. No Google account was authenticated and no successful OAuth round trip is claimed.

A fresh Supabase Management API read confirmed `external_google_enabled=false`, with no Google client ID or secret configured. Google Cloud still displays the identity-verification page in Chrome. The remaining blocker is Google Cloud login, creation/configuration of the OAuth client, and provider activation. No deployment was performed.
