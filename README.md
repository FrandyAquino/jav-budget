# jav-budget

An offline-first personal finance app built with Expo SDK 58, React Native, TypeScript, Expo Router, and PanelUI.

## Run

```sh
npm install
npm start -- --clear
```

Open the Metro URL on a device or press `w` for the web preview. Native modules must be available in the installed development build. Face ID requires a development build; web intentionally disables biometrics and local reminders.

```sh
npm run typecheck
npm run lint
npm test
npm run test:web-bundle # with Metro running on localhost:8081
npx expo export --platform all
```

## Features

- Home, Activity, Add, Budgets, and Insights tabs; secondary Accounts, Categories, Recurring, Goals, and Settings screens.
- Persistent system/light/dark appearance, plus a quick theme toggle on Home.
- Income and expense categories with editable colors and icons; transactions with notes, dates, search, filters, and grouping.
- Cash, bank, and credit accounts; atomic transfers, explicit received amounts for foreign-currency transfers, and credit debt tracking.
- Monthly category budgets with immediate progress and overspending warnings.
- Daily, weekly, biweekly, monthly, and custom recurring entries with pause, edit, cancel, and deterministic occurrence IDs.
- Interactive charts, weekly/monthly/custom periods, cash flow, spending breakdowns, and budget utilization.
- DOP and USD reported separately. An optional manual DOP/USD rate (Settings) enables a combined net worth on Home and in the widget; no rate is ever assumed.
- Bilingual UI (Español / English, following the device language or a Settings override).
- Monthly category budgets with optional rollover, an overall monthly cap, and copy-from-last-month.
- Transactions with tags, receipt photos, multi-category splits, and duplicate; virtualized Activity list (FlashList).
- CSV import from bank exports with column mapping, preview, and duplicate detection.
- iOS home-screen widget and quick actions (development build required).
- Manual savings goals, recurring subscription labels, device authentication, and local bill reminders.
- Validated JSON backup/restore and explicit demo data controls.

## Architecture

`src/app` contains route entry points. Feature screens live in `src/features`; `src/shared` holds reusable PanelUI-backed controls, theme tokens, charts, navigation, and period selection. `src/features/finance` contains the pure financial model, runtime schema, serialized persistence store, and platform services.

Expo Router async routes are explicitly disabled. SDK 58 enables them on web by default; the development session exhibited stale module IDs while hydrating/loading route chunks. Loading all route modules together avoids that failure path. After updating dependencies or restarting Metro, fully reload existing browser tabs. `test:web-bundle` checks the served module graph and ensures every route/layout is present with no missing synchronous dependencies.

Amounts are integer cents. Account balances and budget totals are derived from transactions. Transfers are one record affecting both accounts and do not count as income or expenses. Writes are validated and persisted before the UI reports success. Web writes use Web Locks where supported to coordinate tabs. Invalid stored data is preserved and presents a recovery error rather than silently resetting it.

The first launch opens a short onboarding (language, default currency and optional DOP/USD rate, first account, starter categories) or, if you prefer, clearly labeled sample data. From the demo, **Start fresh** (or Settings → erase all data) returns to the onboarding. Data saved before onboarding existed is treated as already onboarded. Data stays on this installation: SQLite on iOS/Android (migrated once from the previous AsyncStorage document, which is kept as a backup) and a localStorage document on web. There is no bank integration; cloud sync is optional (below). On iOS/Android the ledger is encrypted with SQLCipher (`jav-budget-secure.db`) using a random key kept in the keychain/keystore (expo-secure-store); the first launch of an encrypted build copies the older unencrypted `jav-budget.db` into it and deletes it. Expo Go has no SQLCipher and keeps the unencrypted file. Web storage is not encrypted. Device authentication protects the app interface. Export backups before clearing app/browser storage.

## Cloud sync (optional)

Without an account the app is fully local. Signing in (Settings → Account & sync, or "I already have an account" on the onboarding) with an email one-time code turns on sync and cloud backup through Supabase. Configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (see `.env.example`, restart Metro); without them sync is disabled and the section says so. The server schema is `supabase/migrations/`.

- `src/features/sync/core.ts` holds the pure rules (unit-tested in `tests/sync.test.mts`); `engine.ts` does the I/O.
- Every local write records the changed records/settings in an outbox (same SQLite transaction on native, same Web Lock on web). Pushes upsert `sync_records`/`sync_meta` (deletes are tombstones); pulls page by `server_updated_at` (with a 60 s overlap) and apply through `parseState`. Last write wins on the client timestamp: a pending local change newer than the cloud copy is kept. Rows that don't validate yet (e.g. a transaction whose account hasn't arrived) are parked and retried.
- Synced: accounts, categories, transactions, budgets, monthly budgets, recurring rules, goals, and the name, email, currency, number entry and exchange rate. Device-local: appearance, language, app lock, notifications, app icon, automatic backups, last export, onboarding and demo flags.
- First sign-in: an empty device downloads; an empty cloud receives this device's data; when both have data you choose Merge (union by id, newest change wins), Replace this device, or Cancel. Sample data is never uploaded. A device that synced with another account must be replaced before it syncs with a new one. Signing out keeps or erases this device's copy. Settings → Account & sync → Delete account removes the receipt photos, then calls `delete_account()` (the user's sync rows cascade), keeping or erasing this device's copy.
- Sync runs after sign-in, on launch and foreground, 2 s after local changes, from "Sync now", and in the background task. Receipt photos upload to the private `receipts` bucket (`<user id>/<file>`), download in the background or on view, and are removed when no transaction uses them. Web receipts are page-lifetime blobs, so web doesn't upload them; it shows synced photos through signed URLs.

## Crash reports and updates

Release builds report crashes to Sentry when `EXPO_PUBLIC_SENTRY_DSN` is set (`src/shared/monitoring`): no default PII, no console/input breadcrumbs, no screenshots or replay; never in development or on web. Over-the-air updates use EAS Update (`runtimeVersion` follows the app version). Release steps, store copy and the privacy policy: `docs/RELEASE.md`, `docs/STORE.md`, `docs/PRIVACY.md`.

## Recurrences and reminders

Due entries are processed on launch, foregrounding, and midnight while the app is running. Missed occurrences catch up on reopening; processing is capped at 600 occurrences per rule per pass. This is local bookkeeping, not automatic bank payments or guaranteed background execution. Month-end schedules retain their original anchor day.

Native reminders schedule several upcoming occurrences per active expense rule plus credit-card due dates, nearest first, capped at 60 (under the iOS limit of 64). A background task (expo-background-task) also processes due entries and refreshes reminders when the OS allows it. Delivery depends on OS permissions and settings. Demo data never schedules notifications. Savings goals are manual progress records and do not move account funds.

## Validation

Domain tests (`npm test`) cover cents, dates, balances, edits/deletions, transfers, budget isolation, schedule frequencies, duplicate prevention, month-end handling, backup integrity, and chart reconciliation. Browser checks covered theme persistence, transaction creation/editing, budget updates, search, and grouping.

Physical-device testing is still required for biometrics, notification delivery, gestures, haptics, and native keyboard/layout behavior before a store release. Metro exports are bundle validation, not signed native builds or device QA.

## Testing

| Command | What it runs |
| --- | --- |
| `npm test` | Domain tests (`tests/*.test.mts`, `node:test`), no React Native. |
| `npm run test:ui` | UI/integration tests (`__tests__/**/*.test.tsx`) with Jest, `jest-expo/ios` and React Native Testing Library. |
| `maestro test .maestro/` | End-to-end flows on an iOS simulator. |

### UI tests (Jest)

The tests render the real route tree in `src/app` with `renderRouter` from `expo-router/testing-library`, so the root layout's providers (FinanceProvider, I18nProvider, PanelUI, safe area) are all real. Each test writes a small ledger to storage, then drives the UI by role and accessibility label. Strings come from the `en`/`es` dictionaries, so copy changes don't break the tests.

- `add-expense`: add an expense; it shows in Activity and lowers the Home balance.
- `transactions`: edit in place (no duplicate); duplicate creates a copy.
- `split`: remaining-to-allocate, over-allocation error, "Use remaining".
- `budgets`: create with rollover, overall monthly budget card, copy from last month.
- `categories`: create a category from the budget and transaction pickers.
- `settings`: switch to Español; an exchange rate gives a combined net worth on Home.
- `activity`: the FlashList renders rows; search and kind filters work.
- `sync`: email-code sign-in (wrong code, resend cooldown) uploads local data; "Sync now" pushes and pulls; the merge confirmation. Supabase is replaced by `__tests__/helpers/supabase-mock.ts`.

Test setup lives in `jest.config.js`, `jest.setup.ts` and `__mocks__/`:

- Storage uses `__mocks__/finance-backend.ts`, which follows the backend contract on top of the official AsyncStorage Jest mock. expo-sqlite isn't loaded.
- expo-notifications, expo-local-authentication and expo-background-task are mocked. Quick actions and widget sync render nothing.
- expo-router's testing library swaps Reanimated for its mock. PanelUI's BottomSheet needs the real API, so `jest.setup.ts` puts the web build back in place.
- `__tests__/helpers/babel-dynamic-import.js` lets Babel turn `import()` (used in `device.ts`) into `require()` under Jest.

### End-to-end (Maestro)

Flows live in `.maestro/flows/` and cover the same journeys. Each flow starts from a fresh install via `.maestro/subflows/launch-fresh.yaml` (`clearState`), which picks "Explore with demo data" on the onboarding so it runs against the labeled sample data. The flows match English text, so use a simulator set to English.

```sh
# 1. Install Maestro: https://docs.maestro.dev/getting-started/installing-maestro
# 2. Build and install the app on a booted iOS simulator (dev build), with Metro running
npx expo run:ios
# 3. Run every flow, or a single one
maestro test .maestro/
maestro test .maestro/flows/04-budgets.yaml
```

Before running, dismiss any Metro or dev-menu overlay so it doesn't cover the tab bar. On EAS, run the same flows against a simulator build (see [E2E tests on EAS Workflows](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)).

## Personalization

Set your default currency and number-entry preference in Settings. A new transaction chooses an account in that currency when available; selecting another account uses its own currency without an exchange-rate assumption. Account/category controls open searchable, virtualized lists. Create a category directly from the picker to preserve the transaction draft.

Transactions can retain a local date and time. Older entries have no fabricated time. Repeat supports none, daily, weekly, every two weeks, monthly, and a custom interval of 1–365 days. Upcoming reports project the next 30 days and do not post future entries.

Settings includes a local profile (not an online identity), appearance, Graphite/Chalk launcher icons, decimal or digits-as-cents transaction entry, file-based JSON import/export, and confirmed data replacement. Launcher icon changes require a new development build containing the config plugin and bundled assets. iOS date/time selection uses Expo UI; web/Android use the cross-platform date and time sheets.

Web uses `web.output: "single"`, avoiding the Expo SSR metadata module failure reproduced during development. Serve the exported web app with an SPA fallback for deep links. The only server-side state is the optional Supabase sync project.
