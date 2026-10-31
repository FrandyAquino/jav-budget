// expo-crypto's AES-GCM API (SDK 58) backed by Node's WebCrypto, for suites
// that exercise encrypted files. Use as jest.mock("expo-crypto", aesMock).
type Bytes = Uint8Array<ArrayBuffer>;
export function aesMock() {
  // Jest runs on Node, whose global WebCrypto implements AES-GCM.
  const webcrypto = globalThis.crypto;
  const subtle = webcrypto.subtle;
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (h) => parseInt(h, 16));
  class AESEncryptionKey {
    constructor(readonly raw: Bytes) {}
    static async generate() {
      return new AESEncryptionKey(webcrypto.getRandomValues(new Uint8Array(32)));
    }
    static async import(text: string) {
      return new AESEncryptionKey(fromHex(text));
    }
    async encoded() {
      return hex(this.raw);
    }
  }
  class AESSealedData {
    constructor(readonly bytes: Bytes) {}
    static fromCombined(base64: string) {
      return new AESSealedData(fromB64(base64));
    }
    async combined() {
      return b64(this.bytes);
    }
  }
  const cryptoKey = (key: AESEncryptionKey) =>
    subtle.importKey("raw", key.raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    AESEncryptionKey,
    AESSealedData,
    async aesEncryptAsync(plain: Bytes, key: AESEncryptionKey, { additionalData }: { additionalData: Bytes }) {
      const iv = webcrypto.getRandomValues(new Uint8Array(12));
      const sealed = new Uint8Array(
        await subtle.encrypt({ name: "AES-GCM", iv, additionalData }, await cryptoKey(key), plain),
      );
      const combined = new Uint8Array(iv.length + sealed.length);
      combined.set(iv);
      combined.set(sealed, iv.length);
      return new AESSealedData(combined);
    },
    async aesDecryptAsync(sealed: AESSealedData, key: AESEncryptionKey, { additionalData }: { additionalData: Bytes }) {
      return new Uint8Array(
        await subtle.decrypt(
          { name: "AES-GCM", iv: sealed.bytes.slice(0, 12), additionalData },
          await cryptoKey(key),
          sealed.bytes.slice(12),
        ),
      );
    },
  };
}

// In-memory expo-secure-store; `__items` exposes the stored values.
export function secureStoreMock() {
  const items = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void items.set(key, value),
    deleteItemAsync: async (key: string) => void items.delete(key),
    __items: items,
  };
}
