// Staff do clube do usuário (preparador físico, treinador, olheiro, analista) e missões de
// observação. Clubes da IA não têm staff detalhado: o nível efetivo vem do treino do clube.
//
// Efeitos (nível 1-5, 3 = neutro):
//   preparador: recuperação entre jogos ×(1 + 0,06·(n−3))
//   treinador:  treino efetivo para evolução = treino do clube + 0,5·(n−3)
//   olheiro:    base +1 de nível por ponto acima de 3; prospectos melhores; potencial mais preciso
//   analista:   gols esperados a favor ×(1 + 0,015·(n−3))

import { makePlayer } from '../data/fictionalLeague';
import type { Club, Level, Player, Position, StaffMember, StaffRole } from '../domain/types';
import { createRng, deriveSeed, gaussian, int, pick, type Rng } from '../engine/rng';

export const STAFF_ROLES: StaffRole[] = ['preparador', 'treinador', 'olheiro', 'analista'];

export const ROLE_LABEL: Record<StaffRole, string> = {
  preparador: 'Preparador físico',
  treinador: 'Auxiliar técnico',
  olheiro: 'Olheiro-chefe',
  analista: 'Analista de desempenho',
};

export const ROLE_EFFECT: Record<StaffRole, string> = {
  preparador: 'Recuperação física entre os jogos.',
  treinador: 'Evolução dos jogadores no treino.',
  olheiro: 'Qualidade da base, prospectos e precisão do potencial.',
  analista: 'Preparação de jogo (pequeno bônus de ataque).',
};

const FIRST = ['Carlos', 'Paulo', 'Jorge', 'Miguel', 'Hans', 'Luigi', 'Pierre', 'Ricardo', 'Tomás', 'Erik', 'Sérgio', 'Vítor', 'Alan', 'Dario', 'Emil'];
const LAST = ['Moreira', 'Bauer', 'Conti', 'Lefèvre', 'Navarro', 'Silva', 'Keller', 'Romano', 'Duarte', 'Holm', 'Barros', 'Vidal', 'Kovač', 'Pires', 'Weiss'];

/** Salário semanal pelo nível (o nível 5 custa ~25 vezes o nível 1). */
export function staffWage(level: number): number {
  return Math.round(1_500 * level * level / 100) * 100;
}

export function makeStaff(rng: Rng, id: string, role: StaffRole, level: number): StaffMember {
  const lv = Math.max(1, Math.min(5, Math.round(level)));
  return { id, name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`, role, level: lv, wage: staffWage(lv) };
}

/** Staff inicial do clube do usuário, no nível do treino do clube. */
export function initialStaff(club: Club, seed: number): Partial<Record<StaffRole, StaffMember>> {
  const rng = createRng(deriveSeed(seed, 'staff', club.id));
  const out: Partial<Record<StaffRole, StaffMember>> = {};
  for (const role of STAFF_ROLES) out[role] = makeStaff(rng, `${club.id}-${role}`, role, club.training);
  return out;
}

/** Mercado de staff da temporada: 3 opções por cargo, níveis espalhados. */
export function staffMarket(seed: number, year: number): StaffMember[] {
  const rng = createRng(deriveSeed(seed, 'mercado-staff', year));
  const out: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    for (let k = 0; k < 3; k++) out.push(makeStaff(rng, `staff-${year}-${role}-${k}`, role, int(rng, 1, 5)));
  }
  return out;
}

/**
 * Nível efetivo de um cargo. Clube sem staff detalhado (IA) é neutro (3): o efeito é só do
 * usuário. No clube do usuário, cargo vago vale nível 1.
 */
export function staffLevel(club: Club, role: StaffRole): number {
  if (!club.staff) return 3;
  return club.staff[role]?.level ?? 1;
}

export function recoveryFactor(club: Club): number {
  return 1 + 0.06 * (staffLevel(club, 'preparador') - 3);
}

export function effectiveTraining(club: Club): number {
  return Math.max(1, Math.min(5, club.training + 0.5 * (staffLevel(club, 'treinador') - 3)));
}

export function analystFactor(club: Club): number {
  return 1 + 0.015 * (staffLevel(club, 'analista') - 3);
}

export function staffWages(club: Club): number {
  return Object.values(club.staff ?? {}).reduce((a, s) => a + (s?.wage ?? 0), 0);
}

/**
 * Faixa de potencial que o usuário enxerga num jogador de outro clube: com olheiro nível 5 o
 * valor exato; com nível 1, ±8.
 */
export function potentialRange(p: Player, scoutLevel: number): [number, number] {
  const err = Math.max(0, (5 - Math.round(scoutLevel)) * 2);
  if (err === 0) return [p.potential, p.potential];
  // Faixa estável por jogador (não muda a cada tela).
  const shift = (p.id.length * 7 + p.age) % (err + 1);
  return [Math.max(1, p.potential - shift), Math.min(99, p.potential - shift + err)];
}

export const SCOUT_REGIONS = ['Brasil', 'Argentina', 'África Ocidental', 'Leste Europeu', 'Escandinávia', 'Japão e Coreia'] as const;
export type ScoutRegion = (typeof SCOUT_REGIONS)[number];
const REGION_NAT: Record<ScoutRegion, string[]> = {
  Brasil: ['BRA'],
  Argentina: ['ARG', 'URU'],
  'África Ocidental': ['SEN', 'NGA', 'CIV', 'GHA'],
  'Leste Europeu': ['SRB', 'CRO', 'POL', 'UKR'],
  Escandinávia: ['DEN', 'SWE', 'NOR'],
  'Japão e Coreia': ['JPN', 'KOR'],
};
const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

/** Datas entre duas missões de observação. */
export const SCOUT_COOLDOWN = 8;

/**
 * Missão de observação: 3 jovens (16-18) da região, agentes livres que só o usuário conhece
 * (`scoutedFor`). Quanto melhor o olheiro, maior o potencial.
 */
export function scoutProspects(club: Club, level: number, region: ScoutRegion, seed: number, year: number, slot: number): Player[] {
  const rng = createRng(deriveSeed(seed, 'olheiro', year, slot, region));
  const out: Player[] = [];
  for (let k = 0; k < 3; k++) {
    const pos = pick(rng, POSITIONS);
    const target = 52 + 2 * level + gaussian(rng, 0, 3);
    // Crescimento por ano até os 27: olheiro bom acha potencial alto.
    const p = makePlayer(rng, `prospecto-${year}-${slot}-${k + 1}`, null, pos, target, year, [16, 18], [1 + 0.25 * level, 2 + 0.3 * level]);
    out.push({ ...p, nationality: pick(rng, REGION_NAT[region]), clubId: null, scoutedFor: club.id, contract: { wage: 800, expires: year } });
  }
  return out;
}

/** Nível do olheiro como Level (para a base). */
export function scoutLevelAsLevel(club: Club): Level {
  return Math.max(1, Math.min(5, Math.round(staffLevel(club, 'olheiro')))) as Level;
}
