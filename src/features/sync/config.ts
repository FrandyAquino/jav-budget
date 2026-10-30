// These build-time variables are required (see .env.example). Without them
// the account gate blocks access and explains that the build is not configured.
// EXPO_PUBLIC_ values must be read with static `process.env.X` access.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const syncConfigured = !!(SUPABASE_URL && SUPABASE_KEY);
export const RECEIPTS_BUCKET = "receipts";
