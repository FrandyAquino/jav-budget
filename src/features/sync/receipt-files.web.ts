// Web keeps receipts as page-lifetime blob: URLs (no file names), so nothing is
// uploaded or downloaded; photos synced from phones are shown via signed URLs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECEIPTS_BUCKET } from "./config";

export const receiptSyncSupported = false;
export function receiptExists(_name: string) {
  return false;
}
export async function uploadReceipt(_client: SupabaseClient, _user: string, _name: string) {}
export async function downloadReceipt(_client: SupabaseClient, _user: string, _name: string) {}
export async function receiptUrl(client: SupabaseClient, user: string, name: string) {
  const { data } = await client.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(`${user}/${name}`, 3600);
  return data?.signedUrl;
}
