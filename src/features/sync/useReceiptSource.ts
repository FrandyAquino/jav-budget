import { useEffect, useState } from "react";
import { receiptName } from "@/features/transactions/receipt-names";
import { resolveReceipt } from "@/features/transactions/receipts";
import { fetchReceipt } from "./engine";
import { receiptExists, receiptSyncSupported } from "./receipt-files";
import { useSyncStatus } from "./status";

// The displayable URI of a stored receipt. A photo synced from another device
// that isn't on this one yet is downloaded on view (native) or shown through a
// short-lived signed URL (web). `version` changes when the file appears.
export function useReceiptSource(value?: string) {
  const { user } = useSyncStatus();
  const resolved = (value && resolveReceipt(value)) || undefined;
  const name = value ? receiptName(value) : undefined;
  const [remote, setRemote] = useState<{ name: string; url?: string; version: number }>();
  const missing = !!name && !!user && (!receiptSyncSupported || !receiptExists(name));
  useEffect(() => {
    if (!missing || !name) return;
    let active = true;
    void fetchReceipt(name).then((result) => {
      if (active && (result.downloaded || result.url))
        setRemote({ name, url: result.url, version: Date.now() });
    });
    return () => {
      active = false;
    };
  }, [missing, name]);
  const current = remote?.name === name ? remote : undefined;
  return {
    uri: current?.url ?? resolved,
    version: current?.version ?? 0,
  };
}
