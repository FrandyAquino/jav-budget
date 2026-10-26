// Native receipt files <-> private Storage bucket receipts/<user id>/<name>.
import { Directory, File, Paths } from "expo-file-system";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECEIPTS_FOLDER } from "@/features/transactions/receipt-names";
import { RECEIPTS_BUCKET } from "./config";

export const receiptSyncSupported = true;
const folder = () => new Directory(Paths.document, RECEIPTS_FOLDER);
const contentType = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "heic" ? "image/heic" : ext === "webp" ? "image/webp" : "image/jpeg";
};

export function receiptExists(name: string) {
  try {
    return new File(folder(), name).exists;
  } catch {
    return false;
  }
}
export async function uploadReceipt(client: SupabaseClient, user: string, name: string) {
  // ArrayBuffer upload, as recommended for React Native.
  const body = await new File(folder(), name).arrayBuffer();
  const { error } = await client.storage
    .from(RECEIPTS_BUCKET)
    .upload(`${user}/${name}`, body, { contentType: contentType(name), upsert: true });
  if (error) throw error;
}
export async function downloadReceipt(client: SupabaseClient, user: string, name: string) {
  const { data, error } = await client.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(`${user}/${name}`, 300);
  if (error || !data) throw error ?? new Error("No signed URL");
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  await File.downloadFileAsync(data.signedUrl, new File(dir, name), { idempotent: true });
}
// Native shows the downloaded local file instead.
export async function receiptUrl(
  _client: SupabaseClient,
  _user: string,
  _name: string,
): Promise<string | undefined> {
  return undefined;
}
