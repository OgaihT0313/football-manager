// Save versionado. O arquivo guarda { saveVersion, savedAt, data }; ao carregar, as migrações
// levam `data` da versão gravada até CURRENT_SAVE_VERSION, uma versão por vez.
// O armazenamento concreto (arquivo no celular, localStorage no web) entra por StorageAdapter.

import { CURRENT_SAVE_VERSION, type CareerState } from '../career/career';

export interface SaveEnvelope {
  saveVersion: number;
  /** Milissegundos desde 1970 (passado por quem salva, o domínio não lê o relógio). */
  savedAt: number;
  data: unknown;
}

export class SaveError extends Error {}

/**
 * Migrações: a chave é a versão de origem; a função devolve os dados na versão seguinte.
 * Ao mudar o formato de CareerState: subir CURRENT_SAVE_VERSION e adicionar a migração aqui.
 */
export const MIGRATIONS: Record<number, (data: any) => any> = {};

export function serializeCareer(career: CareerState, savedAt: number): string {
  const envelope: SaveEnvelope = { saveVersion: CURRENT_SAVE_VERSION, savedAt, data: career };
  return JSON.stringify(envelope);
}

export function migrate(
  data: unknown,
  fromVersion: number,
  migrations: Record<number, (data: any) => any> = MIGRATIONS,
  target = CURRENT_SAVE_VERSION,
): unknown {
  if (fromVersion > target) throw new SaveError(`Save da versão ${fromVersion} é mais novo que o app (versão ${target}).`);
  let out = data;
  for (let v = fromVersion; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new SaveError(`Falta a migração do save da versão ${v} para ${v + 1}.`);
    out = step(out);
  }
  return out;
}

export function deserializeCareer(text: string): { career: CareerState; savedAt: number } {
  let envelope: SaveEnvelope;
  try {
    envelope = JSON.parse(text) as SaveEnvelope;
  } catch {
    throw new SaveError('Save corrompido (JSON inválido).');
  }
  if (!envelope || typeof envelope.saveVersion !== 'number' || envelope.data == null) {
    throw new SaveError('Save sem versão ou sem dados.');
  }
  const data = migrate(envelope.data, envelope.saveVersion) as CareerState;
  if (!data.userClubId || !data.clubs?.[data.userClubId] || !data.season?.fixtures) {
    throw new SaveError('Save incompleto (faltam clube, clubes ou temporada).');
  }
  return { career: { ...data, saveVersion: CURRENT_SAVE_VERSION }, savedAt: envelope.savedAt ?? 0 };
}

export interface StorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Storage em memória, para testes e scripts. */
export function memoryStorage(): StorageAdapter & { dump(): Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    async read(key) {
      return data[key] ?? null;
    },
    async write(key, value) {
      data[key] = value;
    },
    async remove(key) {
      delete data[key];
    },
    dump: () => ({ ...data }),
  };
}

export const SAVE_KEY = 'carreira';

export function createSaveService(storage: StorageAdapter, key = SAVE_KEY) {
  return {
    async save(career: CareerState, now: number): Promise<void> {
      await storage.write(key, serializeCareer(career, now));
    },
    /** null = não há save. Lança SaveError se existir e não puder ser lido. */
    async load(): Promise<{ career: CareerState; savedAt: number } | null> {
      const text = await storage.read(key);
      if (text == null) return null;
      return deserializeCareer(text);
    },
    async clear(): Promise<void> {
      await storage.remove(key);
    },
  };
}
