# MVP verification — October 22, 2026

## Follow-up: unknown Metro module 2167

- Confirmed the reported error and hydration overlay in the existing Safari tab; Chrome's existing session was still rendering.
- Disabled Expo Router `asyncRoutes` explicitly (SDK 58 defaults web to async). Restarted Metro with `--clear` and fully reloaded Safari. No financial data was cleared.
- Added `npm run test:web-bundle`: parses the actual served JavaScript with TypeScript, checks synchronous dependency IDs, and verifies all 12 route/layout modules. Passed with 2,118 modules, including after a route file invalidation/Fast Refresh.
- Safari: Home, Activity, Budgets, Insights, and Add rendered after the fix. Chrome private session: direct navigation to Accounts, Categories, Recurring, Goals, and Settings; opened their editors; verified empty category validation and theme switching.
- Created a daily recurrence for RD$10 in the private test ledger. It generated one transaction and advanced to the next day. Reloaded and searched history again: still exactly one transaction.
- Repeated TypeScript, lint, 22 domain tests, Expo Doctor (20/20), and web/iOS/Android Metro export. All passed. The fresh Metro log contained no web errors during these checks.
- Evidence scope: browser runtime and compiled native bundles. Physical device validation remains outstanding as described below.

## Passed locally

- TypeScript strict check and Expo ESLint.
- 22 domain tests, including integer-cent arithmetic, transfer conservation, budget recalculation, date-range endpoints, four recurrence frequencies, idempotency, month-end anchors, and invalid backup rejection.
- Expo dependency compatibility check after SDK 58 patch updates.
- Expo Doctor: 20/20 checks passed.
- Metro export for web, iOS, and Android. These are JavaScript/native bundles, not signed device builds.
- Browser in an isolated private session: light/dark toggle and reload persistence; create expense; edit without duplication; Enter does not submit; balance, expense totals, and category budget update immediately; transaction search and category grouping.
- PanelUI date picker and custom range: October 20–22 showed RD$2,555 of expenses and matching negative cash flow in the test ledger. Final light/dark dashboards rendered after a clean Metro restart; an SVG DOM-property warning was corrected.

## Release work still required

- Physical iOS/Android QA: authentication, notification permissions/delivery, swipe gestures, haptics, keyboard interaction, accessibility, and small-screen layouts.
- Signed development/release builds and store assets. Graphite/Chalk app icons were added October 23; device verification remains pending.
- Dependency audit: npm reports 21 high-severity affected dependency nodes, traced to `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm) and `node-forge <=1.4.0` (GHSA-86w9-cpqp-85rv) in the Expo/Metro toolchain. npm's proposed force fix downgrades Expo to SDK 44 and was not applied. Reassess when compatible upstream fixes are available; this is not a clean security-audit result.
- No cloud backup or encrypted local database. The app lock protects the interface only.
- Recurrences catch up when the app runs; no guarantee of execution while the OS has terminated it. Reminders schedule the next occurrence, not an unlimited future series.

## Customization update — October 23, 2026

- Neutral graphite/chalk theme, monochrome account/category icons, simpler labels, and new bundled app icons.
- Searchable virtualized account/category lists; create a category from the transaction form without discarding its draft. Currency defaults globally and follows the selected account; no transaction currency question.
- Optional local transaction time, native Expo UI date/time picker on iOS, and date/hour/minute sheets on Android/web. Legacy records keep missing time rather than receiving a fabricated value.
- None/daily/weekly/biweekly/monthly/custom recurrence menu; custom intervals are 1–365 days. Existing schedules remain readable.
- Home, Activity and Insights support category/day/week/month/recurring/upcoming views. Upcoming is explicitly a forecast for the next 30 days and never changes account balances.
- Settings: local name/email profile, appearance, currency, decimal vs digits-as-cents entry, account/category management, native alternate icons, file-based JSON import, export and confirmed erase.
- 28 domain tests passed, including backup defaults, time preservation, cents-entry interpretation, custom schedules and non-mutating forecasts. TypeScript and lint passed. Native and web Metro exports succeeded.
- Browser QA in a private ledger: changed account through the list; created and selected a category from the transaction form; recorded RD$25.50 with a custom three-day recurrence, next occurrence October 26.
- Additional Metro server metadata failure reproduced even with async routes off. Web now uses Expo's `single` output: this local-first app does not need SSR or API routes. Bundle graph verification passes and the restarted web log has no unknown-module errors.
- Alternate icon switching and Expo UI's SwiftUI picker require physical iPhone validation in a fresh native development build. They are not represented as browser-tested native behavior.
- Reload verification retained the new category, RD$25.50 amount and 08:15 time. Changing global currency to USD selected Dollar savings automatically for the next entry. Digits-as-cents input `1250` displayed and saved `$12.50`. Insights' Upcoming view displayed its forecast disclaimer without changing account balances.
