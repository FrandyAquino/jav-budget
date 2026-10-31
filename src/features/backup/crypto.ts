// At-rest encryption for the native automatic backups in Documents/Backups.
// AES-256-GCM with a random key kept in the keychain/keystore (the same
// pattern as src/features/sync/session-storage.ts). Explicit exports and
// "Share latest backup" stay plain JSON: the user chose to take a copy out.
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

// Encrypted files start with this marker; anything else is a legacy plain
// JSON backup written before encryption existed and is still restorable.
export const SEALED_PREFIX = "jav-budget-backup:v1:";
const KEY = "jav-budget.backup-key.v1";
// AFTER_FIRST_UNLOCK (as the ledger key in storage/backend.ts): the background
// task backs up while the device is locked, and the key follows an encrypted
// device backup together with the Documents folder.
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
// Binds a file to its owner: a file moved into another account's folder fails.
const context = (owner: string) => `jav-budget.backup.v1:${owner}`;

let loading: Promise<AESEncryptionKey> | undefined;
function backupKey() {
  loading ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (stored) return AESEncryptionKey.import(stored, "hex");
    const key = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(KEY, await key.encoded("hex"), OPTIONS);
    return key;
  })().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

const encoder = new TextEncoder();

export async function sealBackup(content: string, owner: string): Promise<string> {
  const sealed = await aesEncryptAsync(encoder.encode(content), await backupKey(), {
    additionalData: encoder.encode(context(owner)),
  });
  return SEALED_PREFIX + (await sealed.combined("base64"));
}

export const isSealedBackup = (raw: string) => raw.startsWith(SEALED_PREFIX);

// Plain JSON (legacy) passes through; sealed content is authenticated and
// decrypted, throwing when the key or owner doesn't match.
export async function openBackup(raw: string, owner: string): Promise<string> {
  if (!isSealedBackup(raw)) return raw;
  const plaintext = await aesDecryptAsync(
    AESSealedData.fromCombined(raw.slice(SEALED_PREFIX.length)),
    await backupKey(),
    { additionalData: encoder.encode(context(owner)) },
  );
  return new TextDecoder().decode(plaintext);
}
