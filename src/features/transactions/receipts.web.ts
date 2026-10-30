// expo-file-system is not available on web. The picker returns a blob: URL that
// only lives as long as the page, so web receipts are not durable across reloads.
export function resolveReceipt(uri: string) {
  return uri;
}

export async function persistReceipt(uri: string): Promise<string> {
  return uri;
}

export function deleteReceipt(uri?: string) {
  if (uri?.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(uri);
    } catch {
      // Nothing to release.
    }
  }
}

// Nothing is stored on web.
export function sweepReceipts(_state: unknown) {}

export const receiptsPersist = false;
export function clearReceiptCache() {}
