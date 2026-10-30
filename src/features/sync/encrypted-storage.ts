type Storage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};
type Cipher = {
  seal(value: string, context: string): Promise<string>;
  open(value: string, context: string): Promise<string>;
};

// The new slot is committed before removing legacy plaintext. An unreadable
// encrypted session never falls back to an older plaintext session.
export function encryptedStorage(storage: Storage, cipher: Cipher) {
  let pending: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = pending.then(work);
    pending = next.catch(() => {});
    return next;
  }
  const slot = (key: string) => `encrypted:v1:${key}`;
  return {
    getItem: (key: string) => serial(async () => {
      const sealed = await storage.getItem(slot(key));
      if (sealed !== null) {
        await storage.removeItem(key);
        try { return await cipher.open(sealed, key); } catch { return null; }
      }
      const legacy = await storage.getItem(key);
      if (legacy === null) return null;
      await storage.setItem(slot(key), await cipher.seal(legacy, key));
      await storage.removeItem(key);
      return legacy;
    }),
    setItem: (key: string, value: string) => serial(async () => {
      await storage.setItem(slot(key), await cipher.seal(value, key));
      await storage.removeItem(key);
    }),
    removeItem: (key: string) => serial(async () => {
      await storage.removeItem(key);
      await storage.removeItem(slot(key));
    }),
  };
}
