// Estado do app (Zustand). A lógica do jogo fica em src/; aqui só se chama o domínio, guarda o
// resultado e salva automaticamente depois de cada ação que muda a carreira.

import { create } from 'zustand';
import {
  advanceRound, advanceToNextMatch, autoPickUserXI, cloneForStep, newCareer, setUserFormation, setUserSlot, setUserTactic,
  simulateRounds, startNextSeason, type CareerState,
} from '../src/career/career';
import type { Club, Formation, LeagueConfig, Level, Player } from '../src/domain/types';
import { acceptJob, answerDecision, hireStaff, sendScout } from '../src/career/managerCareer';
import type { MarketResult } from '../src/career/userMarket';
import type { ScoutRegion } from '../src/manager/staff';
import { currentMarker } from '../src/market/calendar';
import { createSaveService, SaveError } from '../src/save/saveService';
import { storage } from '../src/save/storage';
import leaguesJson from '../data/world/leagues.json';
import clubsJson from '../data/world/clubs.json';
import playersJson from '../data/world/players.json';

export type Tab = 'inicio' | 'elenco' | 'escalacao' | 'mercado' | 'clube' | 'liga';
export type Phase = 'carregando' | 'menu' | 'escolhaClube' | 'jogo';
export type ThemePref = 'system' | 'light' | 'dark';

const saves = createSaveService(storage);
const THEME_KEY = 'tema';

export const baseData = {
  leagues: leaguesJson as LeagueConfig[],
  clubs: clubsJson as Club[],
  players: playersJson as Player[],
};

interface SaveInfo {
  clubName: string;
  year: number;
  round: number;
  totalRounds: number;
  savedAt: number;
}

interface GameState {
  phase: Phase;
  career: CareerState | null;
  saveInfo: SaveInfo | null;
  loadError: string | null;
  saveError: string | null;
  tab: Tab;
  matchDetailId: string | null;
  /** Competição exibida na aba Liga (null = liga do usuário). */
  leagueView: string | null;
  /** Rodada exibida na aba Rodadas (null = rodada atual). */
  roundView: number | null;
  busy: boolean;
  themePref: ThemePref;
  /** Mensagem curta exibida no rodapé (resultado de uma ação). */
  toast: string | null;

  init(): Promise<void>;
  goToClubSelect(): void;
  backToMenu(): void;
  startCareer(clubId: string): void;
  continueCareer(): Promise<void>;
  deleteSave(): Promise<void>;
  setTab(tab: Tab): void;
  openMatch(fixtureId: string | null): void;
  setRoundView(round: number | null): void;
  setLeagueView(id: string | null): void;
  playNextRound(): void;
  simulateToEnd(): void;
  nextSeason(): void;
  setFormation(f: Formation): void;
  setTacticLevel(key: 'pressing' | 'lineHeight' | 'tempo', value: Level): void;
  setSlot(slot: number, playerId: string): void;
  autoXI(): void;
  setThemePref(pref: ThemePref): void;
  /** Roda uma ação de mercado; se der certo, salva. Devolve o resultado para a tela. */
  market(action: (c: CareerState) => { career: CareerState; result: MarketResult }): MarketResult;
  clearToast(): void;
  /** Assume o comando de um clube com vaga aberta. */
  takeJob(clubId: string): MarketResult;
  /** Responde uma decisão pendente (coletiva, jogador insatisfeito). */
  decide(decisionId: string, option: number): void;
  hire(staffId: string): MarketResult;
  scout(region: ScoutRegion): MarketResult;
  /** Avança uma data (usado quando o técnico está sem clube). */
  advanceOne(): void;
}

function infoOf(c: CareerState, savedAt: number): SaveInfo {
  return {
    clubName: c.clubs[c.userClubId]?.name ?? '?',
    year: c.season.year,
    round: Math.min(currentMarker(c.season) - 1, 38),
    totalRounds: 38,
    savedAt,
  };
}

export const useGame = create<GameState>()((set, get) => {
  /** Troca a carreira e salva em segundo plano. */
  const commit = (career: CareerState) => {
    const now = Date.now();
    set({ career, saveInfo: infoOf(career, now) });
    saves.save(career, now).then(
      () => get().saveError && set({ saveError: null }),
      (e: unknown) => set({ saveError: `Não foi possível salvar: ${String(e)}` }),
    );
  };
  const update = (f: (c: CareerState) => CareerState) => {
    const c = get().career;
    if (c) commit(f(c));
  };
  /** Roda uma ação pesada depois de a interface mostrar o "carregando". */
  const heavy = (f: () => void) => {
    set({ busy: true });
    setTimeout(() => {
      try {
        f();
      } finally {
        set({ busy: false });
      }
    }, 16);
  };

  return {
    phase: 'carregando',
    career: null,
    saveInfo: null,
    loadError: null,
    saveError: null,
    tab: 'inicio',
    matchDetailId: null,
    leagueView: null,
    roundView: null,
    busy: false,
    themePref: 'system',
    toast: null,

    async init() {
      const theme = (await storage.read(THEME_KEY).catch(() => null)) as ThemePref | null;
      if (theme === 'light' || theme === 'dark' || theme === 'system') set({ themePref: theme });
      try {
        const loaded = await saves.load();
        set({ phase: 'menu', saveInfo: loaded ? infoOf(loaded.career, loaded.savedAt) : null, career: loaded?.career ?? null });
      } catch (e) {
        set({ phase: 'menu', loadError: e instanceof SaveError ? e.message : String(e) });
      }
    },

    goToClubSelect: () => set({ phase: 'escolhaClube' }),
    backToMenu: () => set({ phase: 'menu', matchDetailId: null }),

    startCareer(clubId) {
      const career = newCareer({
        ...baseData,
        userClubId: clubId,
        // A seed da carreira vem do relógio; dentro do domínio tudo é determinístico.
        seed: Date.now() >>> 0,
        year: 2026,
      });
      commit(career);
      set({ phase: 'jogo', tab: 'inicio', roundView: null, matchDetailId: null, loadError: null });
    },

    async continueCareer() {
      if (get().career) {
        set({ phase: 'jogo', tab: 'inicio', roundView: null });
        return;
      }
      try {
        const loaded = await saves.load();
        if (loaded) set({ career: loaded.career, phase: 'jogo', tab: 'inicio', roundView: null });
      } catch (e) {
        set({ loadError: e instanceof SaveError ? e.message : String(e) });
      }
    },

    async deleteSave() {
      await saves.clear();
      set({ career: null, saveInfo: null, loadError: null });
    },

    setTab: (tab) => set({ tab }),
    openMatch: (fixtureId) => set({ matchDetailId: fixtureId }),
    setRoundView: (round) => set({ roundView: round }),
    setLeagueView: (id) => set({ leagueView: id, roundView: null }),

    playNextRound() {
      heavy(() => {
        const c = get().career;
        if (!c) return;
        const { career, result } = advanceToNextMatch(c);
        commit(career);
        if (result) set({ matchDetailId: result.fixtureId });
      });
    },

    simulateToEnd() {
      heavy(() => update((c) => simulateRounds(c)));
    },

    nextSeason() {
      heavy(() => {
        update((c) => autoPickUserXI(startNextSeason(c)));
        set({ roundView: null, tab: 'inicio' });
      });
    },

    setFormation: (f) => update((c) => setUserFormation(c, f)),
    setTacticLevel: (key, value) => update((c) => setUserTactic(c, { [key]: value })),
    setSlot: (slot, playerId) => update((c) => setUserSlot(c, slot, playerId)),
    autoXI: () => update(autoPickUserXI),

    setThemePref(pref) {
      set({ themePref: pref });
      storage.write(THEME_KEY, pref).catch(() => undefined);
    },

    market(action) {
      const c = get().career;
      if (!c) return { ok: false, message: 'Sem carreira carregada.' };
      const { career, result } = action(c);
      if (career !== c) commit(career);
      if (result.ok) set({ toast: result.message });
      return result;
    },
    clearToast: () => set({ toast: null }),

    takeJob(clubId) {
      const r = get().market((c) => acceptJob(c, clubId, cloneForStep, autoPickUserXI));
      if (r.ok) set({ tab: 'inicio', leagueView: null, roundView: null });
      return r;
    },
    decide(decisionId, option) {
      update((c) => answerDecision(c, decisionId, option, cloneForStep));
    },
    hire: (staffId) => get().market((c) => hireStaff(c, staffId, cloneForStep)),
    scout: (region) => get().market((c) => sendScout(c, region, cloneForStep)),
    advanceOne() {
      heavy(() => update((c) => advanceRound(c).career));
    },
  };
});

// Seletores. Devolvem referências que só mudam quando o dado muda, para não re-renderizar à toa.
export const selectCareer = (s: GameState) => s.career;
export const selectSeason = (s: GameState) => s.career?.season ?? null;
export const selectUserClub = (s: GameState) => (s.career ? (s.career.clubs[s.career.userClubId] ?? null) : null);
export const selectPlayers = (s: GameState) => s.career?.players ?? null;
export const selectClubs = (s: GameState) => s.career?.clubs ?? null;
