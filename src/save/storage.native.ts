// Armazenamento do save no celular: um arquivo JSON por chave na pasta de documentos do app.
// Grava primeiro num arquivo temporário e depois troca, para não corromper o save se o app
// fechar no meio da escrita.

import { File, Paths } from 'expo-file-system';
import type { StorageAdapter } from './saveService';

const fileFor = (key: string) => new File(Paths.document, `${key}.json`);

export const storage: StorageAdapter = {
  async read(key) {
    const file = fileFor(key);
    if (!file.exists) return null;
    return file.text();
  },
  async write(key, value) {
    const tmp = new File(Paths.document, `${key}.tmp.json`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    await tmp.write(value);
    await tmp.move(fileFor(key), { overwrite: true });
  },
  async remove(key) {
    const file = fileFor(key);
    if (file.exists) file.delete();
  },
};
