# Release checklist

Current verification and open release gates: [October 28 readiness report](./READINESS.md). Account access is now required; rebuild native apps before distributing these changes.

EAS project: `@frandyaquino/jav-budget` (`extra.eas.projectId` in `app.json`). Updates: `https://u.expo.dev/<projectId>`, `runtimeVersion` policy `appVersion`, one channel per build profile (`development`, `preview`, `production`).

## 1. Secrets and services

| What | Where | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (local), EAS environment variables (builds/updates) | `npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value … --visibility plaintext` |
| `EXPO_PUBLIC_SENTRY_DSN` | same | Optional. Without it, release builds report no crashes. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | EAS secrets | Needed to upload source maps; then remove `SENTRY_DISABLE_AUTO_UPLOAD` from `eas.json`. |
| Supabase migrations | `supabase/migrations/` | Applied to project `ldhuiyinksudcfpxbuqh` (sync, delete_account). |

Supabase Auth (project `ldhuiyinksudcfpxbuqh`): the user explicitly chose the built-in email provider without purchasing a domain. Custom SMTP fields were cleared and read back successfully. Supabase restored its default link templates and a limit of 2 emails/hour. This provider sends only to project organization team members; it is not public-user email delivery. Do not grant administrative team membership merely to let app users sign in.

The app now accepts a copied email verification link, or a six-digit code if custom templates are restored later. Copy the email button's link without opening it and paste it into the app; the app verifies its token directly with this project's Supabase instead of following the URL's redirect. Link opening/deep-link callbacks are not implemented by this change. `supabase/email/auth-templates.json` is retained as an inactive custom-SMTP reference; applying it to the free built-in provider returns HTTP 400.

Verified: a generated link for the existing dedicated test account produced a real session and was rejected on replay. No email was sent in that test, so inbox delivery remains unverified. See [Supabase SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Builds

```sh
npx eas-cli@latest build --profile development --platform ios      # device dev client (registers devices)
npx eas-cli@latest build --profile preview --platform android      # installable APK for QA
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform ios
```

iOS needs an Apple Developer account; the first build creates certificates and profiles for the app and the `ExpoWidgetsTarget` extension (App Group `group.com.frandyaquino.javbudget`). Android's first build creates the upload keystore; keep EAS as its owner.

## Web

`npm run deploy:web` exports the web build and deploys it to EAS Hosting: https://jav-budget.expo.app (first deployed October 26, 2026). On an iPhone without a developer build, open it in Safari → Share → Add to Home Screen. Web has no Face ID, notifications, widget or encrypted ledger (data stays unencrypted in the browser's storage).

## 3. Device QA (physical iPhone and Android phone)

- [ ] Fresh install → onboarding → first expense → Home balance.
- [ ] Update over an older install with data: the ledger migrates to the encrypted file (`Documents/SQLite/jav-budget-secure.db`), nothing is lost.
- [ ] Face ID / fingerprint lock, privacy cover in the app switcher.
- [ ] Notifications: permission prompt, reminder delivery for a bill due tomorrow.
- [ ] Background task: due recurring entries post after a day closed.
- [ ] Receipt photo from camera and library; sync uploads it; second device shows it.
- [ ] Sign in with email code, sync with a second device, sign out (keep/erase), delete account.
- [ ] Widget (small, medium), quick actions, Chalk alternate icon.
- [ ] CSV import from a real bank export; JSON export/import.
- [ ] VoiceOver / TalkBack on Home, Add and Activity; Dynamic Type at largest size; small screen (iPhone SE / 360 dp).
- [ ] Spanish and English device languages.
- [ ] Airplane mode: everything works; sync resumes when back online.
- [ ] OTA: `npx eas-cli@latest update --channel preview --message "QA"` reaches the preview build after two restarts.

End-to-end flows: `maestro test .maestro/` on an iOS simulator with a Release build (`npx expo run:ios --configuration Release`; a dev client shows its launcher after `clearState`). Needs Java (`brew install openjdk`, `JAVA_HOME=/opt/homebrew/opt/openjdk`). All 8 flows passed on October 26, 2026 (iPhone 18 Pro Max, iOS 27.1). They match English text.

## 4. Store

Copy, privacy answers and review notes: `docs/STORE.md`. Privacy policy: `docs/PRIVACY.md`, public at https://github.com/FrandyAquino/jav-budget/blob/main/docs/PRIVACY.md (contact: GitHub issues).

## Known limits

- Xcode 27 clean builds fail in ExpoSQLite with "module '_Builtin_stdarg' is needed but has not been provided" (Swift explicit modules). Build with `SWIFT_ENABLE_EXPLICIT_MODULES=NO`, e.g. `xcodebuild -workspace ios/JavBudget.xcworkspace -scheme JavBudget -configuration Release -destination id=<simulator> SWIFT_ENABLE_EXPLICIT_MODULES=NO build`. Incremental `npx expo run:ios` builds work. Watch for it on the first EAS iOS build.
- Email sign-in was verified end to end on October 26 (code from Resend to `delivered@resend.dev`, verified in the app, then Settings → Delete account removed the user and its rows).

- `npm audit` (October 28): node-forge updated to 1.4.2. The remaining high advisory is Zod 3 in Expo CLI, with three affected dependency nodes. No compatible automatic fix is offered; do not downgrade the app to Expo 51. See `docs/SECURITY-REVIEW.md`.
- Native Supabase sessions now use AES-GCM in SQLite with the key in SecureStore. Migration, force-close/reopen and tamper rejection passed in an iOS 27.0 simulator Release build on October 28. Physical-device, Android and sign-out QA remain pending. Keep simulator signing enabled for SecureStore access. Web session storage remains readable to same-origin JavaScript.
- Android Auto Backup restores the encrypted ledger without its keystore key; on such a restore the app reports the data as unreadable and offers to start empty (sync or a JSON backup restores it).
- Web keeps the ledger in unencrypted `localStorage` and doesn't send crash reports.
