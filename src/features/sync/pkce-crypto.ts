import { CryptoDigestAlgorithm, digest, getRandomValues } from "expo-crypto";

// Supabase's PKCE implementation otherwise falls back to Math.random/plain
// on native Hermes. Provide only the primitives it needs, backed by Expo.
export function installPkceCrypto() {
  if (typeof globalThis.crypto === "undefined")
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  if (typeof globalThis.crypto.getRandomValues !== "function")
    Object.defineProperty(globalThis.crypto, "getRandomValues", { value: getRandomValues, configurable: true });
  if (!globalThis.crypto.subtle)
    Object.defineProperty(globalThis.crypto, "subtle", { value: {}, configurable: true });
  if (typeof globalThis.crypto.subtle.digest !== "function") {
    const sha256: SubtleCrypto["digest"] = async (algorithm, data) => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      if (name.toUpperCase() !== "SHA-256") throw new Error("Unsupported PKCE digest");
      return digest(CryptoDigestAlgorithm.SHA256, data);
    };
    Object.defineProperty(globalThis.crypto.subtle, "digest", { value: sha256, configurable: true });
  }
}
