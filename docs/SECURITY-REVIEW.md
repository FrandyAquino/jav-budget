# Security review — 2026-10-28

Scope: source review and local remediation of authentication, account isolation, persisted sessions, web concurrency, crash reporting and dependencies. Includes automated requests against the configured Supabase project using dedicated test accounts. Changes are local; no deployment or installed-device security certification.

## Findings and fixes

| Priority | Finding | Remediation and evidence |
| --- | --- | --- |
| High | A valid pasted link for another email could publish that identity before checking the email the user entered, potentially adopting an unowned local ledger into the wrong account. | Verify with a nonpersisting client, compare the returned email, then publish the session. Regression verifies mismatched links never set the session or upload data. |
| High | A web storage event could publish another account's ledger while the tab still retained its old access state; queued edits could target a replaced ledger. | Close access before reading external snapshots; only deliver matching-owner snapshots. Check ownership inside native transactions/web locks, including sync acknowledgements and metadata updates. Web sync writes require Web Locks. Two tests exercise the real web backend with simulated storage events and stale-owner writes. |
| Medium | Native Supabase session credentials were stored as plaintext in SQLite localStorage. | AES-GCM ciphertext with associated storage-key data; encryption key in SecureStore. Commit encrypted session before removing legacy plaintext. Decryption failure does not revive an old session. Three adapter tests cover migration, large Unicode sessions, failure, tampering and swapped slots, using Node cryptography. Expo Crypto/SecureStore migration, process restart and tamper rejection subsequently passed on the installed iOS simulator Release build (see native validation below). Physical-device/Android QA remains open. Logical deletion does not guarantee forensic erasure of previously stored SQLite pages. |
| Medium | An authentication failure during synchronization could leave the retained ledger accessible. | Close the access gate on authentication errors; preserve local data. UI regression checks 401 handling; separate offline regression preserves established-owner offline access. |
| Medium | JavaScript exception text, request context and breadcrumbs could include credentials or financial input when crash reporting is enabled. | Allowlist build metadata and stack locations, discard exception text/context and all breadcrumbs. Regression injects sensitive values into these fields and checks their removal. This does not certify native crash payloads or a live Sentry deployment. |
| High, tooling | node-forge dependency advisory. | Updated resolved package from 1.4.0 to 1.4.2; no longer reported by npm audit. |

The crash hook follows [Sentry's client-side scrubbing guidance](https://www.sentry.help/en/articles/13964268-what-are-sentry-s-data-scrubbing-options). Diagnostics deliberately lose free-form messages and context to reduce disclosure risk.

## Verification

- Lint and TypeScript: passed.
- Domain: 128 tests passed.
- UI/backend regressions: 38 tests passed; native services and Supabase mocked. Real web storage backend is exercised with mocked browser coordination/storage.
- Supabase integration: 11 tests passed against `ldhuiyinksudcfpxbuqh`. Covers forged ownership, cross-account reads/updates/deletes/reassignment, anonymous access, receipt isolation and sync between independent clients. Local ledger/filesystem in this harness are simulated; this is not physical-device sync QA.
- JavaScript/assets exported for web, iOS and Android. A subsequent iOS simulator Release build was installed and tested as documented below.
- `.env.local` and integration credentials are ignored by Git and untracked.
- Diff whitespace check passed.

## Remaining limits

- npm audit reports 17 affected dependency nodes: 3 high, 14 low, no critical. The high Zod 3 advisory is in the Expo CLI dependency chain; application Zod is 4.6.7. The offered automatic fix downgrades Expo to 51 and was not applied. Do not process untrusted inputs with affected tooling; await a compatible upstream update. [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- iOS simulator migration, key persistence across force-close/reopen and tamper rejection passed. Test these on physical iOS/Android devices, plus background access, sign-out and restored-device behavior before release. A missing SecureStore key cannot decrypt the session and requires login again.
- Web data/session localStorage remains accessible to same-origin JavaScript. Automatic JSON backups and explicitly exported files are not encrypted. Account gating is not protection against a compromised device or arbitrary same-origin script execution.
- Offline access for the established owner is intentional; server revocation cannot be learned until connectivity returns.
- Default Supabase email delivery remains selected, with no domain purchase or custom SMTP. It restricts supported recipients; successful automated authentication does not establish public-user email delivery.
- No independent penetration test, physical-device QA, native-crash payload audit, or production deployment was performed in this review.

## Installed iOS simulator validation — 2026-10-28

Environment: a separate `Jav Security QA` iPhone 17 simulator, iOS 27.0, newly generated native project and Release build. No personal simulator data was replaced. Local build used `SWIFT_ENABLE_EXPLICIT_MODULES=NO`, local ad-hoc simulator signing, and disabled Sentry artifact upload. No app was published.

Four Maestro runs completed successfully:

1. Without a session, the installed app shows the sign-in gate.
2. With a valid dedicated QA account session seeded into the legacy SQLite storage key while the app was stopped, launch migrates it and reaches onboarding. SQL inspection finds only the encrypted auth slot (2,592 characters), with no legacy session key or plaintext `access_token` field.
3. After terminating the process and relaunching, onboarding remains accessible. This exercises native decryption with the persisted SecureStore key across processes.
4. After altering one byte in the ciphertext authentication tag and planting an old plaintext session, launch shows the sign-in gate. SQL inspection confirms the old plaintext key was removed; it was not used as fallback.

The built Info.plist contains `UIFileSharingEnabled=false` and `LSSupportsOpeningDocumentsInPlace=false`. The native ledger file does not have a plaintext SQLite header (supporting inspection, not a full cryptographic audit).

The initial unsigned build could not access SecureStore (`A required entitlement is not present`). Rebuilding with simulator signing enabled fixed this; do not use `CODE_SIGNING_ALLOWED=NO` for this QA. No app security bypass was added.

Local evidence: `/tmp/jav-native-security/` contains build logs, `signed-out-retry.log`, `migration.log`, `reopen.log`, `tamper.log` and `storage-evidence.json`. The temporary session credential file was deleted. The account session came from the existing integration-test credentials, not email delivery or the sign-in UI. These results do not establish physical-device behavior, Android behavior, background sync, or receipt/backup workflows.
