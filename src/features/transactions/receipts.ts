import { Directory, File, Paths } from "expo-file-system";
import { id, type FinanceState } from "@/features/finance/model";
import { orphanReceipts, receiptName, RECEIPTS_FOLDER } from "./receipt-names";

// Receipts live in the app's document directory so they survive cache clearing.
const folder = () => new Directory(Paths.document, RECEIPTS_FOLDER);

// iOS can move the app container between updates, so absolute URIs go stale.
// Re-anchor anything stored in our receipts folder to the current document path.
export function resolveReceipt(uri: string) {
  if (!uri.includes(`/${RECEIPTS_FOLDER}/`)) return uri;
  const name = receiptName(uri);
  // Inside our folder but not a name we create: never resolve it.
  if (!name) return "";
  try {
    return new File(folder(), name).uri;
  } catch {
    return uri;
  }
}

// Copies a picked/captured image (usually in the cache) into the receipts folder.
export async function persistReceipt(uri: string): Promise<string> {
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const source = new File(uri);
  const extension = /^\.[a-z0-9]{1,5}$/i.test(source.extension)
    ? source.extension.toLowerCase()
    : ".jpg";
  const target = new File(dir, `${id()}${extension}`);
  await source.copy(target);
  return target.uri;
}

// Best effort: only files inside our receipts folder are ever removed.
export function deleteReceipt(uri?: string) {
  if (!uri) return;
  try {
    const resolved = resolveReceipt(uri);
    if (!resolved || !resolved.startsWith(folder().uri)) return;
    const file = new File(resolved);
    if (file.exists) file.delete();
  } catch {
    // The file may already be gone; the record no longer references it.
  }
}

// Best effort: removes receipt files no transaction references (after Start
// fresh, restoring a backup, loading the demo, and once at startup).
export function sweepReceipts(state: Pick<FinanceState, "transactions">) {
  try {
    const dir = folder();
    if (!dir.exists) return;
    const files = dir.list().filter((entry) => entry instanceof File);
    const orphans = new Set(
      orphanReceipts(
        files.map((f) => f.name),
        state,
      ),
    );
    for (const file of files)
      if (orphans.has(file.name))
        try {
          file.delete();
        } catch {
          // Keep going; the next sweep retries.
        }
  } catch {
    // The folder may not exist or be readable yet.
  }
}

export const receiptsPersist = true;
