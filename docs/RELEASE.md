# Release checklist

EAS project: `@frandyaquino/jav-budget` (`extra.eas.projectId` in `app.json`). Updates: `https://u.expo.dev/<projectId>`, `runtimeVersion` policy `appVersion`, one channel per build profile (`development`, `preview`, `production`).

## 1. Secrets and services

| What | Where | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (local), EAS environment variables (builds/updates) | `npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value … --visibility plaintext` |
| `EXPO_PUBLIC_SENTRY_DSN` | same | Optional. Without it, release builds report no crashes. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | EAS secrets | Needed to upload source maps; then remove `SENTRY_DISABLE_AUTO_UPLOAD` from `eas.json`. |
| Supabase migrations | `supabase/migrations/` | Applied to project `ldhuiyinksudcfpxbuqh` (sync, delete_account). |

Supabase Auth (project `ldhuiyinksudcfpxbuqh`, set October 26): 6-digit codes that expire in 10 minutes; code email templates from `supabase/email/auth-templates.json`; SMTP through Resend (`smtp.resend.com:465`, user `resend`, sender `Jav Budget <onboarding@resend.dev>`, 30 emails/hour).

**Before launch:** `onboarding@resend.dev` only delivers to the Resend account's own address. Verify a domain in Resend, then change the sender (Dashboard → Authentication → Emails → SMTP Settings, or `smtp_admin_email` through the Management API). To re-apply the templates:

```sh
T=$(security find-generic-password -s "Supabase CLI" -a supabase -w); T=${T#go-keyring-base64:}; T=$(echo "$T" | base64 -d 2>/dev/null || echo "$T")
curl -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  --data @supabase/email/auth-templates.json \
  https://api.supabase.com/v1/projects/ldhuiyinksudcfpxbuqh/config/auth
```

## 2. Builds

```sh
npx eas-cli@latest build --profile development --platform ios      # device dev client (registers devices)
npx eas-cli@latest build --profile preview --platform android      # installable APK for QA
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform ios
```

iOS needs an Apple Developer account; the first build creates certificates and profiles for the app and the `ExpoWidgetsTarget` extension (App Group `group.com.frandyaquino.javbudget`). Android's first build creates the upload keystore; keep EAS as its owner.

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

- `npm audit`: high-severity advisories in `node-forge` and `zod@3` come only from `@expo/cli` (build tooling, not shipped in the app). No fixed `node-forge` exists yet; re-check on Expo SDK patch releases.
- The Supabase session token is stored by `expo-sqlite/localStorage` unencrypted; the ledger itself is encrypted.
- Android Auto Backup restores the encrypted ledger without its keystore key; on such a restore the app reports the data as unreadable and offers to start empty (sync or a JSON backup restores it).
- Web keeps the ledger in unencrypted `localStorage` and doesn't send crash reports.
