// Conversão de CSV de ratings para Player[] (e clubes mínimos). Sem fs: o script faz o I/O.
// Formatos aceitos (detalhes em FORMATO-DADOS.md):
//   - 'nativo': as colunas do nosso modelo (attack, creation, defending, physical, goalkeeping...).
//   - 'fifa':   colunas no estilo dos datasets de EA FC/FIFA (pace, shooting, passing...).

import { initFinance } from '../club/finance';
import { computeOvr, FORMATIONS, POSITION_WEIGHTS } from '../domain/positions';
import type { Attributes, Club, Foot, LeagueConfig, Player, Position } from '../domain/types';

export type ImportFormat = 'nativo' | 'fifa';

export const REQUIRED_COLUMNS: Record<ImportFormat, readonly string[]> = {
  nativo: [
    'name', 'age', 'nationality', 'club_id', 'positions', 'foot',
    'attack', 'creation', 'defending', 'physical', 'goalkeeping',
    'potential', 'wage', 'contract_expires', 'value',
  ],
  fifa: [
    'short_name', 'age', 'nationality_name', 'club_name', 'player_positions', 'preferred_foot',
    'overall', 'potential', 'value_eur', 'wage_eur', 'club_contract_valid_until_year',
    'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physic',
    'goalkeeping_diving', 'goalkeeping_handling', 'goalkeeping_kicking', 'goalkeeping_positioning', 'goalkeeping_reflexes',
  ],
};

export class ImportError extends Error {}

/** Parser de CSV com aspas, aceitando vírgula ou ponto e vírgula (Excel em pt-BR). */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') >= 0 ? clean.indexOf('\n') : undefined);
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return { header, rows };
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const FIFA_POSITIONS: Record<string, Position> = {
  GK: 'GK', CB: 'CB', LB: 'LB', LWB: 'LB', RB: 'RB', RWB: 'RB', CDM: 'DM', CM: 'CM',
  CAM: 'AM', LM: 'LW', RM: 'RW', LW: 'LW', RW: 'RW', CF: 'ST', ST: 'ST', LF: 'LW', RF: 'RW',
};
const NATIVE_POSITIONS = new Set<string>(['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']);

const clamp = (v: number) => Math.round(Math.max(1, Math.min(99, v)));

/** Ajusta os atributos que pesam na posição para o OVR calculado bater com `target`. */
function anchorOvr(attrs: Attributes, pos: Position, target: number): Attributes {
  const w = POSITION_WEIGHTS[pos];
  const out = { ...attrs };
  for (let iter = 0; iter < 3; iter++) {
    const diff = target - computeOvr(out, pos);
    if (diff === 0) break;
    for (const key of Object.keys(out) as (keyof Attributes)[]) if (w[key] > 0) out[key] = clamp(out[key] + diff);
  }
  return out;
}

export interface ImportResult {
  players: Player[];
  clubs: Club[];
  /** Uma 1ª divisão por liga encontrada no CSV (sem 2ª divisão nem copa: completar à mão). */
  leagues: LeagueConfig[];
  warnings: string[];
}

export interface ImportOptions {
  format: ImportFormat;
  /** Temporada atual, usada quando falta o ano de fim de contrato. */
  season: number;
  /** Liga usada nos clubes criados quando o CSV não tem coluna de liga. */
  leagueId: string;
}

export function importPlayersCsv(text: string, opts: ImportOptions): ImportResult {
  const { header, rows } = parseCsv(text);
  const required = REQUIRED_COLUMNS[opts.format];
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new ImportError(
      `CSV no formato '${opts.format}' sem as colunas obrigatórias: ${missing.join(', ')}.\n` +
        `Colunas encontradas: ${header.join(', ') || '(nenhuma)'}.\n` +
        `Colunas exigidas: ${required.join(', ')}.`,
    );
  }
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();
  const warnings: string[] = [];
  const errors: string[] = [];
  const players: Player[] = [];
  const clubs: Record<string, Omit<Club, 'finance' | 'training'>> = {};
  const leagueNames: Record<string, string> = {};
  const usedIds = new Set<string>();

  rows.forEach((r, i) => {
    const line = i + 2; // +1 pelo cabeçalho, +1 por começar em 1
    const num = (name: string, fallback?: number): number => {
      const raw = col(r, name).replace(/\s/g, '');
      if (raw === '') {
        if (fallback !== undefined) return fallback;
        errors.push(`linha ${line}: coluna '${name}' vazia`);
        return 0;
      }
      const v = Number(raw.replace(',', '.'));
      if (!Number.isFinite(v)) {
        errors.push(`linha ${line}: coluna '${name}' não é número ('${raw}')`);
        return 0;
      }
      return v;
    };

    let name: string;
    let positions: Position[];
    let foot: Foot;
    let attrs: Attributes;
    let clubName: string;
    let clubId: string;
    let leagueId = opts.leagueId;
    let nationality: string;

    if (opts.format === 'nativo') {
      name = col(r, 'name');
      nationality = col(r, 'nationality');
      clubId = col(r, 'club_id');
      clubName = header.includes('club_name') ? col(r, 'club_name') || clubId : clubId;
      if (header.includes('league_id') && col(r, 'league_id')) leagueId = col(r, 'league_id');
      const rawPos = col(r, 'positions').split(/[;,| ]+/).filter(Boolean).map((p) => p.toUpperCase());
      const bad = rawPos.filter((p) => !NATIVE_POSITIONS.has(p));
      if (bad.length) errors.push(`linha ${line}: posição desconhecida ${bad.join(', ')}`);
      positions = rawPos.filter((p) => NATIVE_POSITIONS.has(p)) as Position[];
      const f = col(r, 'foot').toUpperCase();
      foot = f === 'L' || f === 'B' ? f : 'R';
      attrs = {
        attack: clamp(num('attack')),
        creation: clamp(num('creation')),
        defending: clamp(num('defending')),
        physical: clamp(num('physical')),
        goalkeeping: clamp(num('goalkeeping')),
      };
    } else {
      name = col(r, 'short_name');
      nationality = col(r, 'nationality_name');
      clubName = col(r, 'club_name');
      clubId = slugify(clubName);
      if (header.includes('league_name') && col(r, 'league_name')) {
        leagueId = slugify(col(r, 'league_name'));
        leagueNames[leagueId] = col(r, 'league_name');
      }
      const rawPos = col(r, 'player_positions').split(/[,;/ ]+/).filter(Boolean).map((p) => p.toUpperCase());
      positions = [];
      for (const p of rawPos) {
        const mapped = FIFA_POSITIONS[p];
        if (mapped && !positions.includes(mapped)) positions.push(mapped);
      }
      const f = col(r, 'preferred_foot').toLowerCase();
      foot = f.startsWith('l') ? 'L' : 'R';
      // Goleiros costumam vir sem pace/shooting/...: usa valores baixos no lugar.
      const pace = num('pace', 35);
      const shooting = num('shooting', 20);
      const passing = num('passing', 40);
      const dribbling = num('dribbling', 25);
      const defending = num('defending', 20);
      const physic = num('physic', 50);
      const gk = ['goalkeeping_diving', 'goalkeeping_handling', 'goalkeeping_kicking', 'goalkeeping_positioning', 'goalkeeping_reflexes'];
      const gkAvg = gk.reduce((a, c) => a + num(c, 10), 0) / gk.length;
      attrs = {
        attack: clamp(0.55 * shooting + 0.25 * dribbling + 0.2 * pace),
        creation: clamp(0.6 * passing + 0.4 * dribbling),
        defending: clamp(defending),
        physical: clamp(0.5 * physic + 0.5 * pace),
        goalkeeping: clamp(gkAvg),
      };
      if (positions[0]) attrs = anchorOvr(attrs, positions[0], clamp(num('overall')));
    }

    if (!name) errors.push(`linha ${line}: nome vazio`);
    if (positions.length === 0) {
      errors.push(`linha ${line}: nenhuma posição reconhecida`);
      return;
    }
    if (!clubId) {
      warnings.push(`linha ${line}: ${name} sem clube (fica como agente livre)`);
    }

    const baseId = opts.format === 'nativo' && header.includes('id') && col(r, 'id') ? col(r, 'id') : `${clubId || 'livre'}-${slugify(name)}`;
    let id = baseId;
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
    usedIds.add(id);

    const ovr = computeOvr(attrs, positions[0] as Position);
    const isFifa = opts.format === 'fifa';
    const player: Player = {
      id,
      name,
      age: num('age'),
      nationality,
      positions,
      foot,
      ovr,
      potential: clamp(Math.max(ovr, num('potential'))),
      contract: {
        wage: Math.round(num(isFifa ? 'wage_eur' : 'wage', 0)),
        expires: Math.round(num(isFifa ? 'club_contract_valid_until_year' : 'contract_expires', opts.season + 1)),
      },
      value: Math.round(num(isFifa ? 'value_eur' : 'value', 0)),
      clubId: clubId || null,
      morale: 50,
      fitness: 100,
      ...attrs,
    };
    players.push(player);

    if (clubId) {
      let club = clubs[clubId];
      if (!club) {
        club = {
          id: clubId,
          name: clubName || clubId,
          shortName: (clubName || clubId).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
          leagueId,
          squad: [],
          startingXI: [],
          tactic: { formation: '4-3-3', pressing: 3, lineHeight: 3, tempo: 3 },
          budget: 0,
          wageBudget: 0,
          reputation: 50,
        };
        clubs[clubId] = club;
      }
      club.squad.push(id);
    }
  });

  if (errors.length > 0) {
    const shown = errors.slice(0, 20).join('\n  ');
    throw new ImportError(`${errors.length} erro(s) nos dados:\n  ${shown}${errors.length > 20 ? '\n  ...' : ''}`);
  }

  for (const club of Object.values(clubs)) {
    const gks = club.squad.filter((pid) => players.find((p) => p.id === pid)?.positions[0] === 'GK').length;
    if (club.squad.length < FORMATIONS[club.tactic.formation].length) warnings.push(`${club.name}: só ${club.squad.length} jogadores`);
    if (gks === 0) warnings.push(`${club.name}: nenhum goleiro`);
  }

  // Reputação pela força do elenco (média dos 11 melhores) e finanças pela folha salarial.
  const byId: Record<string, Player> = {};
  for (const p of players) byId[p.id] = p;
  const finished = Object.values(clubs).map((c) => {
    const top = c.squad.map((id) => byId[id]?.ovr ?? 0).sort((a, b) => b - a).slice(0, 11);
    const avg = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
    return initFinance({ ...c, reputation: Math.round(Math.max(1, Math.min(100, (avg - 55) * 3))) }, byId);
  });
  const leagues: LeagueConfig[] = [...new Set(finished.map((c) => c.leagueId))].map((id) => ({
    id,
    name: leagueNames[id] ?? id,
    country: leagueNames[id] ?? id,
    clubIds: finished.filter((c) => c.leagueId === id).map((c) => c.id),
    pointsForWin: 3,
    pointsForDraw: 1,
    legs: 2,
    tiebreakers: ['points', 'goalDiff', 'goalsFor', 'headToHead', 'wins', 'awayGoalsFor'],
    tier: 1,
    mode: 'full',
  }));
  for (const l of leagues) if (l.clubIds.length % 2 === 1) warnings.push(`${l.name}: número ímpar de clubes (${l.clubIds.length}); haverá folga por rodada`);
  return { players, clubs: finished, leagues, warnings };
}
