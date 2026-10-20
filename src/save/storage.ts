// Armazenamento do save no web: IndexedDB (cota grande; o save do mundo passa de 4 MB, perto do
// limite do localStorage). Se o IndexedDB não existir, usa localStorage. Um save antigo que esteja
// no localStorage é lido normalmente e passa para o IndexedDB na próxima gravação.
// No celular o Metro usa storage.native.ts.

import type { StorageAdapter } from './saveService';

const PREFIX = 'football-manager:';
const DB_NAME = 'football-manager';
const STORE = 'saves';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const idb = globalThis.indexedDB;
    if (!idb) return resolve(null);
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const storage: StorageAdapter = {
  async read(key) {
    const db = await openDb();
    if (db) {
      const value = await tx<string | undefined>(db, 'readonly', (s) => s.get(key));
      if (typeof value === 'string') return value;
    }
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  },
  async write(key, value) {
    const db = await openDb();
    if (db) {
      await tx(db, 'readwrite', (s) => s.put(value, key));
      globalThis.localStorage?.removeItem(PREFIX + key);
      return;
    }
    globalThis.localStorage?.setItem(PREFIX + key, value);
  },
  async remove(key) {
    const db = await openDb();
    if (db) await tx(db, 'readwrite', (s) => s.delete(key));
    globalThis.localStorage?.removeItem(PREFIX + key);
  },
};
