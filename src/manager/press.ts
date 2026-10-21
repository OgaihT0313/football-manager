// Coletivas de imprensa e decisões do técnico (jogador insatisfeito). Cada decisão tem opções
// com efeito em moral, confiança da diretoria e reputação; sem resposta até o prazo, vale a
// opção padrão.

import type { Club, Fixture, Player } from '../domain/types';
import { pick, type Rng } from '../engine/rng';
import type { Decision, DecisionOption } from './types';

interface PressTemplate {
  /** Quando cabe: favorito, azarão ou jogo grande (mata-mata/final). */
  when: 'favorito' | 'azarao' | 'grande' | 'qualquer';
  question: (opp: string) => string;
  options: DecisionOption[];
  defaultOption: number;
}

const PRESS: PressTemplate[] = [
  {
    when: 'favorito',
    question: (opp) => `Contra o ${opp}, todo mundo espera vitória. O time sente a pressão?`,
    options: [
      { label: 'Vamos impor nosso jogo.', morale: 3, confidence: 1, reputation: 0, outcome: 'O vestiário gostou da confiança.' },
      { label: 'Respeito total ao adversário.', morale: 0, confidence: 0, reputation: 1, outcome: 'Resposta elegante; ninguém se empolgou.' },
      { label: 'Favoritismo não ganha jogo.', morale: -1, confidence: -1, reputation: 0, outcome: 'Soou como desculpa antecipada.' },
    ],
    defaultOption: 1,
  },
  {
    when: 'azarao',
    question: (opp) => `O ${opp} é favorito. Seu time tem chance?`,
    options: [
      { label: 'Vamos lá para vencer.', morale: 3, confidence: 0, reputation: 1, outcome: 'Os jogadores compraram a ideia.' },
      { label: 'Vamos competir e ver.', morale: 1, confidence: 0, reputation: 0, outcome: 'Resposta neutra.' },
      { label: 'Um empate já seria ótimo.', morale: -3, confidence: -1, reputation: -1, outcome: 'O elenco não gostou de ouvir isso.' },
    ],
    defaultOption: 1,
  },
  {
    when: 'grande',
    question: () => 'Jogo grande. Qual é o recado para a torcida?',
    options: [
      { label: 'Contem com a gente: vamos dar tudo.', morale: 4, confidence: 1, reputation: 1, outcome: 'Arquibancada e vestiário inflamados.' },
      { label: 'É mais um jogo, foco no trabalho.', morale: 1, confidence: 0, reputation: 0, outcome: 'Discurso frio, mas seguro.' },
      { label: 'A pressão é do adversário.', morale: 2, confidence: 0, reputation: -1, outcome: 'A provocação repercutiu mal na imprensa.' },
    ],
    defaultOption: 1,
  },
  {
    when: 'qualquer',
    question: () => 'Como você avalia o momento do time?',
    options: [
      { label: 'Estamos no caminho certo.', morale: 2, confidence: 1, reputation: 0, outcome: 'Mensagem positiva.' },
      { label: 'Ainda falta muito a melhorar.', morale: -1, confidence: 1, reputation: 1, outcome: 'A diretoria gostou da autocrítica.' },
      { label: 'Prefiro não comentar.', morale: 0, confidence: -1, reputation: -1, outcome: 'A imprensa não gostou do silêncio.' },
    ],
    defaultOption: 0,
  },
];

/**
 * Coletiva antes do próximo jogo do usuário. Jogo grande (mata-mata, final) sempre tem; os outros
 * têm 30% de chance. Devolve null se não houver coletiva.
 */
export function pressBeforeMatch(
  rng: Rng,
  fx: Fixture,
  opponent: Club,
  userRating: number,
  oppRating: number,
  bigMatch: boolean,
): Decision | null {
  if (!bigMatch && rng.next() > 0.3) return null;
  const when: PressTemplate['when'] = bigMatch ? 'grande' : userRating >= oppRating + 3 ? 'favorito' : oppRating >= userRating + 3 ? 'azarao' : 'qualquer';
  const options = PRESS.filter((t) => t.when === when);
  const t = pick(rng, options.length ? options : PRESS.filter((x) => x.when === 'qualquer'));
  return {
    id: `imprensa-${fx.id}`,
    kind: 'imprensa',
    title: 'Coletiva de imprensa',
    text: t.question(opponent.name),
    options: t.options,
    defaultOption: t.defaultOption,
    deadlineSlot: fx.slot ?? 0,
  };
}

/** Jogador importante com pouco tempo de jogo e moral baixa pede explicação. */
export function unhappyPlayer(p: Player, deadlineSlot: number, year: number): Decision {
  return {
    id: `insatisfeito-${year}-${p.id}`,
    kind: 'insatisfeito',
    title: `${p.name} quer jogar mais`,
    text: `${p.name} (${p.ovr}) está incomodado com o pouco tempo em campo e pediu uma conversa.`,
    playerId: p.id,
    options: [
      { label: 'Prometer mais minutos.', morale: 15, confidence: 0, reputation: 0, outcome: 'Ele saiu motivado da conversa.' },
      { label: 'Pedir paciência.', morale: 4, confidence: 0, reputation: 0, outcome: 'Ele entendeu, mas não ficou feliz.' },
      { label: 'Dizer que a decisão é do técnico.', morale: -10, confidence: 0, reputation: -1, outcome: 'O clima ficou pesado.' },
    ],
    defaultOption: 2,
    deadlineSlot,
  };
}

/** Elenco que sente o efeito de uma decisão: o jogador, ou todo mundo se não houver jogador. */
export function affectedPlayers(d: Decision, club: Club): string[] {
  return d.playerId ? [d.playerId] : club.squad;
}
