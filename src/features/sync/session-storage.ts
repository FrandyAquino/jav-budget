import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { encryptedStorage } from "./encrypted-storage";

const KEY = "jav-budget.session-key.v1";
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
let loading: Promise<AESEncryptionKey> | undefined;
function encryptionKey() {
  if (!loading) {
    loading = (async () => {
      const stored = await SecureStore.getItemAsync(KEY, OPTIONS);
      if (stored) return AESEncryptionKey.import(stored, "hex");
      const key = await AESEncryptionKey.generate();
      await SecureStore.setItemAsync(KEY, await key.encoded("hex"), OPTIONS);
      return key;
    })().catch((error) => { loading = undefined; throw error; });
  }
  return loading;
}

// AES-GCM payloads can exceed SecureStore's small-value limits. Only the key
// goes in the keychain/keystore; SQLite holds authenticated ciphertext.
export function createSessionStorage(storage: globalThis.Storage) {
  const encoder = new TextEncoder();
  return encryptedStorage(storage, {
    async seal(value, context) {
      const sealed = await aesEncryptAsync(encoder.encode(value), await encryptionKey(), {
        additionalData: encoder.encode(context),
      });
      return sealed.combined("base64");
    },
    async open(value, context) {
      const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(value), await encryptionKey(), {
        additionalData: encoder.encode(context),
      });
      return new TextDecoder().decode(plaintext);
    },
  });
}
