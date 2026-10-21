// Save versionado. O arquivo guarda { saveVersion, savedAt, data }; ao carregar, as migrações
// levam `data` da versão gravada até CURRENT_SAVE_VERSION, uma versão por vez.
// O armazenamento concreto (arquivo no celular, localStorage no web) entra por StorageAdapter.

import { CURRENT_SAVE_VERSION, type CareerState } from '../career/career';
import { initFinance } from '../club/finance';
import { initManagerFields } from '../career/managerCareer';
import { buildSlots } from '../competitions/world';
import { BACKGROUND, backgroundLeague } from '../data/fictionalWorld';
import { refreshShowcases } from '../market/abroad';

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
export const MIGRATIONS: Record<number, (data: any) => any> = {
  // v1 → v2 (Fase 2): finanças e treino nos clubes; histórico de transferências, propostas
  // recebidas e pré-contratos na carreira.
  1: (d) => {
    const clubs: Record<string, any> = {};
    for (const [id, club] of Object.entries<any>(d.clubs ?? {})) clubs[id] = club.finance ? club : initFinance(club, d.players ?? {});
    return { ...d, clubs, transfers: d.transfers ?? [], inbox: d.inbox ?? [], preContracts: d.preContracts ?? [] };
  },
  // v2 → v3 (Fase 3): de uma liga para o mundo. A liga vira a única competição, a temporada
  // ganha calendário de datas (38 fins de semana) e o histórico guarda liga e campeões.
  2: (d) => {
    const league = { ...d.league, tier: 1, mode: 'full' };
    const old = d.season;
    const over = old.nextRound > old.totalRounds;
    const competition = {
      id: league.id,
      kind: 'league',
      name: league.name,
      country: league.country,
      leagueId: league.id,
      mode: 'full',
      clubIds: league.clubIds.slice(),
      fixtures: old.fixtures.map((f: any) => ({ ...f, slot: f.round - 1, competitionId: league.id })),
      results: old.results,
      table: old.table,
      context: old.context,
      ratings: {},
      stages: [],
      championId: over ? (old.table[0]?.clubId ?? null) : null,
    };
    const season = {
      year: old.year,
      seed: old.seed,
      slots: buildSlots([]),
      nextSlot: old.nextRound - 1,
      competitions: { [league.id]: competition },
      status: old.status ?? {},
      stats: statsFromResults(old.results ?? []),
    };
    const history = (d.history ?? []).map((h: any) => ({ ...h, leagueId: league.id, winners: { [league.id]: h.championId } }));
    const { league: _l, ...rest } = d;
    return { ...rest, leagues: { [league.id]: league }, season, history };
  },
  // v3 → v4 (Fase 4): competições europeias e ligas de fundo. Os campos novos são opcionais
  // (Club.lowerSince/loanedOut, Fixture.leg/firstLegId, CupStage.slot2, seeds), então a
  // temporada em andamento segue sem Europa; a Europa entra na próxima virada. As ligas de fundo
  // não existem num save antigo: o mundo segue com as ligas que tinha.
  3: (d) => ({ ...d, season: { ...d.season, stats: d.season?.stats ?? {} } }),
  // v4 → v5 (Fase 5): técnico, diretoria, decisões, notícias, vagas, prêmios e staff.
  4: (d) => (d.manager ? d : { ...d, ...initManagerFields(d) }),
  // v5 → v6 (Fase 6): ligas de fundo que faltam (Brasil e Argentina) e vitrines do exterior.
  // `era` é opcional (sem era = atual).
  // As ligas novas jogam a partir da próxima temporada; a vitrine já vale nesta.
  5: (d) => {
    const leagues = { ...d.leagues };
    const clubs = { ...d.clubs };
    const players = { ...d.players };
    const used = new Set<string>(Object.values<any>(clubs).map((c) => c.shortName));
    // Save de antes da Fase 4 (sem ligas de fundo) segue com as ligas que tinha.
    const hasBackground = BACKGROUND.some((spec) => leagues[`${spec.code}1`]);
    for (const spec of hasBackground ? BACKGROUND : []) {
      if (leagues[`${spec.code}1`]) continue;
      const bg = backgroundLeague(spec, d.seed, used);
      leagues[bg.league.id] = bg.league;
      for (const c of bg.clubs) clubs[c.id] = c;
    }
    refreshShowcases(clubs, players, leagues, d.season.year, d.seed);
    return { ...d, leagues, clubs, players };
  },
};

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
  if (!data.userClubId || !data.clubs?.[data.userClubId] || !data.season?.competitions) {
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

/** Recalcula as estatísticas por jogador a partir de resultados completos (migração v2 → v3). */
function statsFromResults(results: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  const line = (id: string) => (out[id] ??= { apps: 0, goals: 0, assists: 0, yellows: 0, reds: 0, ratingSum: 0 });
  for (const r of results) {
    for (const id of [...r.homeXI, ...r.awayXI]) {
      line(id).apps++;
      line(id).ratingSum += r.ratings?.[id] ?? 0;
    }
    for (const e of r.events) {
      if (e.type === 'goal') {
        line(e.playerId).goals++;
        if (e.assistId) line(e.assistId).assists++;
      } else if (e.type === 'yellow') line(e.playerId).yellows++;
      else if (e.type === 'red') line(e.playerId).reds++;
    }
  }
  return out;
}
