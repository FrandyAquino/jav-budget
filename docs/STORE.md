# Store listing — Jav Budget

Draft copy and form answers for App Store Connect and Google Play Console. Screenshots must come from a device or simulator build (see `docs/RELEASE.md`).

## Listing

| Field | English | Español |
| --- | --- | --- |
| Name (≤30) | Jav Budget | Jav Budget |
| Subtitle (≤30, iOS) | Budgets that stay on your phone | Presupuestos en tu teléfono |
| Short description (≤80, Play) | Offline-first budgets, spending and goals in DOP and USD. | Presupuestos, gastos y metas sin conexión, en DOP y USD. |
| Keywords (≤100, iOS) | budget,expenses,finance,money,savings,DOP,peso,spending,tracker,goals | presupuesto,gastos,finanzas,dinero,ahorro,peso,DOP,metas,control |
| Category | Finance | Finanzas |
| Age rating | 4+ / Everyone | 4+ / Todos |

### Description (EN)

Jav Budget keeps track of your money without sending it anywhere.

- Cash, bank and credit card accounts, with transfers and card debt.
- Monthly category budgets with rollover and an overall monthly cap.
- Recurring bills and income, with reminders before they're due.
- Receipt photos, tags and multi-category splits.
- Charts for spending, cash flow and budget use, by week, month or custom range.
- DOP and USD side by side, with an optional exchange rate for a combined net worth.
- Import your bank's CSV export. Back up to a file whenever you want.
- Face ID lock, home-screen widget, light and dark themes, English and Spanish.

Your data stays on your device, encrypted. If you want, sign in with your email to sync between devices; you can delete your account from the app at any time. No ads, no tracking.

### Descripción (ES)

Jav Budget lleva tus finanzas sin enviarlas a ningún lado.

- Cuentas de efectivo, banco y tarjetas de crédito, con transferencias y deuda de tarjeta.
- Presupuestos mensuales por categoría con arrastre de saldo y un tope mensual general.
- Pagos e ingresos recurrentes, con recordatorios antes de que venzan.
- Fotos de recibos, etiquetas y divisiones en varias categorías.
- Gráficas de gastos, flujo de caja y uso del presupuesto por semana, mes o rango.
- DOP y USD lado a lado, con una tasa de cambio opcional para ver tu patrimonio total.
- Importa el CSV de tu banco. Haz un respaldo en archivo cuando quieras.
- Bloqueo con Face ID, widget, tema claro y oscuro, español e inglés.

Tus datos se quedan en tu dispositivo, cifrados. Si quieres, inicia sesión con tu correo para sincronizar entre dispositivos; puedes eliminar tu cuenta desde la app cuando quieras. Sin anuncios ni rastreo.

## App Store Connect — App Privacy

Tracking: **No**. Data collected (all **linked to the user**, **not used for tracking**, purpose **App Functionality**), only when the user signs in:

| Apple category | Type |
| --- | --- |
| Contact Info | Email Address, Name |
| Identifiers | User ID |
| Financial Info | Other Financial Info |
| User Content | Photos or Videos |

If `EXPO_PUBLIC_SENTRY_DSN` is set for the build, also declare **Diagnostics → Crash Data** (not linked, App Functionality) and add `NSPrivacyCollectedDataTypeCrashData` to `ios.privacyManifests` in `app.json`.

## Google Play — Data safety

- Data collected: Personal info → Email address, Name; Financial info → Other financial info; Photos and videos → Photos; App activity: none. Crash logs only if Sentry is enabled.
- Optional collection: **Yes** (only with an account). Encrypted in transit: **Yes**. Users can request deletion: **Yes** (in app, Settings → Account & sync → Delete account).
- Data shared with third parties: **No** (Supabase and Sentry are service providers).
- Account deletion URL (required by Play when accounts exist): the privacy policy page, section "Optional account".

## App Review notes

> The app is fully usable without an account. On first launch choose "Explore with demo data" to see sample data, or create an account to start from zero. Cloud sync (Settings → Account & sync) uses an emailed one-time code. Account deletion is in the same section. Face ID only locks the interface.

Sign-in uses email codes, so a reviewer can't use a fixed password. Either rely on the note above (sync is optional) or create a review mailbox and give its address in App Store Connect.

## Assets needed

- iPhone 6.9" screenshots (1320×2868), 3–10 per language; iPad isn't supported (`supportsTablet` not set).
- Play: 2–8 phone screenshots, feature graphic 1024×500, icon 512×512 (downscale `assets/icons/graphite.png`, 1024×1024).
- Privacy policy URL (`docs/PRIVACY.md` hosted) and support URL.
