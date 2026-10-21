// Tipos da camada de técnico (Fase 5). Tudo JSON puro, dentro do CareerState.

/** O que a diretoria espera da temporada, pela força do elenco na liga. */
export type Mandate = 'titulo' | 'champions' | 'europa' | 'meio' | 'permanencia' | 'acesso';

export interface BoardState {
  mandate: Mandate;
  /** Pior colocação aceitável na liga. */
  targetPosition: number;
  /** 0-100. Abaixo de ~15 no meio da temporada, ou da linha do mandato no fim, demite. */
  confidence: number;
  /** Confiança com que a temporada começou (herdada da anterior). */
  startConfidence: number;
  /** Bônus/ônus acumulado nas copas e na Europa nesta temporada. */
  cupBonus: number;
  /** Texto da diretoria para a temporada. */
  note: string;
}

export interface ManagerSpell {
  clubId: string;
  fromYear: number;
  toYear: number | null;
  /** Como terminou: demitido, saiu para outro clube ou ainda no cargo. */
  end: 'demitido' | 'saiu' | null;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  titles: string[];
}

export interface ManagerState {
  name: string;
  /** 1-100: abre portas para clubes maiores. */
  reputation: number;
  employed: boolean;
  /** Datas seguidas sem clube (o leque de vagas aumenta com o tempo). */
  idleSlots: number;
  spells: ManagerSpell[];
  /** Conquistas desbloqueadas (ids de ACHIEVEMENTS). */
  achievements: string[];
}

/** Vaga aberta num clube (técnico demitido ou saiu). */
export interface Vacancy {
  clubId: string;
  year: number;
  /** Data em que abriu e até quando fica aberta (depois a IA contrata alguém). */
  openedSlot: number;
  closesSlot: number;
}

export interface DecisionOption {
  label: string;
  /** Efeito na moral dos jogadores afetados (ou do elenco inteiro, se `playerId` vazio). */
  morale: number;
  confidence: number;
  reputation: number;
  /** Texto curto do que acontece. */
  outcome: string;
}

export type DecisionKind = 'imprensa' | 'insatisfeito';

/** Decisão pendente do técnico. Sem resposta até `deadlineSlot`, vale a opção `defaultOption`. */
export interface Decision {
  id: string;
  kind: DecisionKind;
  title: string;
  text: string;
  playerId?: string;
  options: DecisionOption[];
  defaultOption: number;
  deadlineSlot: number;
}

export type NewsKind = 'diretoria' | 'emprego' | 'premio' | 'titulo' | 'decisao' | 'staff' | 'olheiro';

export interface NewsItem {
  year: number;
  slot: number;
  kind: NewsKind;
  text: string;
}

export type { StaffMember, StaffRole } from '../domain/types';

export interface AwardWinner {
  playerId: string;
  name: string;
  clubId: string;
  value: number;
}

/** Prêmios de uma competição numa temporada. */
export interface CompetitionAwards {
  competitionId: string;
  artilheiro?: AwardWinner;
  melhor?: AwardWinner;
  revelacao?: AwardWinner;
}
