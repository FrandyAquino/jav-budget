# Release readiness — October 28, 2026

Status: local implementation and automated verification completed for account access and data isolation. Not a production release or complete device QA.

Security follow-up: [security review](./SECURITY-REVIEW.md).

## Changes

- Email sign-in is required before financial screens mount, including direct links. Missing Supabase configuration blocks access.
- The session must match the persisted ledger owner. The established owner can use local data when cloud requests fail; a new account cannot see the previous owner's ledger while replacement is pending.
- Sign-out hides retained data. Account transitions prevent overlapping foreground sync cycles. Queued UI edits cannot write after their account loses access.
- Automatic backups are scoped to the account, including list, restore and share. Existing unowned backups remain on disk but are not attributed to a new account.
- Widgets conceal amounts, quick actions become unavailable and reminders are cleared when ledger access is unavailable. Background processing requires account access.
- Account replacement clears the receipt cache before using the new account's photos, including same-name collisions. A retained ledger after deletion keeps its previous ownership instead of silently uploading to the next account.
- New iOS builds disable Documents sharing through Files. Explicit backup export/share remains available. Existing installed binaries need rebuilding for this native setting.
- Expo SDK 58 patch dependencies were aligned using `npx expo install --fix`.

## Evidence

| Check | Result and scope |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 128 domain tests passed, including email-link validation |
| `npm run test:ui -- --runInBand` | 38 tests passed, including pasted email-link login; Supabase and native storage mocked. Integration suite skipped here and run separately below. |
| `npm run test:it -- --runInBand` | 11 tests passed against Supabase project `ldhuiyinksudcfpxbuqh`, using existing dedicated test accounts. Test records cleaned up. |
| `npx expo-doctor` | 20/20 passed after patch alignment |
| `npx expo export --platform all` | Web, iOS and Android JavaScript/assets exported. Not signed native builds. Metro printed fallback-resolution warnings for Expo Router and a missing Sentry organization/project warning. |
| `git diff --check` | Passed |

The real-backend suite exercises record/settings sync, conflicts, pagination, account switching, receipt upload/download, and direct RLS attacks (forged owner, cross-account updates/deletes, anonymous requests and receipt writes). Independent clients represent devices; the ledger and filesystem in that harness are in memory. This does not establish native SQLite durability, real-device networking or OTP email delivery.

UI tests cover signed-out deep links, sign-out with retained data, account switching without revealing the previous ledger, missing configuration, offline access by the established owner, and cross-account backup access. A browser smoke test was attempted but not completed: no browser connector was available and native Safari navigation timed out.

## Google sign-in follow-up

Google sign-in is implemented locally with PKCE S256 for web and native. Supabase Site URL now uses `https://jav-budget.expo.app` and web/native callbacks are allowlisted. Google credentials are still absent and the provider is disabled. Google Cloud requires user identity verification before setup can proceed. See [Google auth setup and verification](./GOOGLE-AUTH.md). No Google end-to-end login or deployment is claimed.

## Remaining release gates

1. **Email sender:** the user's subsequent instruction selected the default Supabase provider without a domain. Custom SMTP is now disabled (verified by API readback), default templates send links, and the limit is 2 emails/hour to project organization team members only. The app accepts pasted verification links without following their redirects. A generated test-account link produced a real session and failed on replay; no inbox delivery was tested. General-public email login remains unsupported by this provider. No domain purchase is pending or authorized.
2. **Installed app QA:** iOS simulator Release build now passes session migration, force-close/reopen and tamper rejection; the built Info.plist disables Files sharing. See the security review for the exact scope. Physical iOS/Android testing, offline/reconnect, account changes, camera/receipts, biometrics, notifications and backup restore remain pending.
3. **Monitoring:** configure production crash reporting and verify a controlled error arrives. Sentry delivery/source-map upload is not established by Metro export.
4. **Dependency audit:** `npm audit` reports 17 affected nodes (3 high, 14 low, 0 critical). The high advisory is toolchain Zod 3, propagated through Expo CLI; node-forge was updated to 1.4.2. No forced SDK downgrade was applied. This is not a clean security audit.
5. **Distribution:** confirm production environment variables, generate signed builds, complete TestFlight/Android testing and store submission. Nothing was deployed or published in this pass.

## Migration notes

Previously anonymous data is adopted through the existing first-sync flow. Existing owned data remains tied to its original account. Export before deleting an account if you want to reuse its data: a retained copy belonging to a deleted identity is intentionally inaccessible to a different identity. Legacy backups without an owner are preserved but no longer listed in the account-scoped backup screen; recovery needs an explicit ownership decision.

Web localStorage and native automatic JSON backups remain unencrypted. Native Supabase sessions now use AES-GCM ciphertext with a SecureStore key; migration and persistence passed in the installed iOS simulator Release build; physical-device and Android validation remain pending. Exported copies are outside the app's controls. Do not describe the UI gate as encryption.
