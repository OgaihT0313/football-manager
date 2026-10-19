// Armazenamento do save no web: localStorage. No celular o Metro usa storage.native.ts.

import type { StorageAdapter } from './saveService';

const PREFIX = 'football-manager:';

export const storage: StorageAdapter = {
  async read(key) {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  },
  async write(key, value) {
    globalThis.localStorage?.setItem(PREFIX + key, value);
  },
  async remove(key) {
    globalThis.localStorage?.removeItem(PREFIX + key);
  },
};
