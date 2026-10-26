// Cloud sync is optional: without these build-time variables (see .env.example)
// the app stays fully local and the Account section explains it isn't set up.
// EXPO_PUBLIC_ values must be read with static `process.env.X` access.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const syncConfigured = !!(SUPABASE_URL && SUPABASE_KEY);
export const RECEIPTS_BUCKET = "receipts";
