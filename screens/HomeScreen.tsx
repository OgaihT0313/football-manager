// Início: próximo jogo (qualquer competição), jogar, simular, mercado, desfalques, situação na
// liga, próximos jogos, últimos resultados e histórico.

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { Badge, Button, Card, Muted, SectionTitle, Strong } from '../components/ui';
import { nextFixtureOf, outcomeFor, positionOf, resultsOf, roundLabel, upcomingOf, userLeague } from '../src/career/queries';
import { isWorldSeasonOver, type CompetitionState } from '../src/competitions/world';
import type { Fixture } from '../src/domain/types';
import { windowLabel } from '../src/market/calendar';
import { selectCareer, useGame } from '../store/gameStore';

const OUTCOME_TONE = { V: 'good', E: 'neutral', D: 'bad' } as const;

/** "Premier League · rodada 12" ou "FA Cup · Quartas de final". */
function stageLabel(comp: CompetitionState, fx: Fixture): string {
  if (comp.kind === 'league') return `${comp.name} · rodada ${fx.round}`;
  if (comp.kind === 'europe') {
    if (comp.stages[0]?.fixtureIds.includes(fx.id)) return `${comp.name} · fase de liga, rodada ${fx.round}`;
    const stage = comp.stages[fx.round - 1]?.name ?? '';
    return `${comp.name} · ${stage}${fx.leg ? (fx.leg === 1 ? ' (ida)' : ' (volta)') : ''}`;
  }
  const stage = comp.stages[fx.round - 1]?.name ?? '';
  return `${comp.name}${stage ? ` · ${stage}` : ''}`;
}

export function HomeScreen() {
  const career = useGame(selectCareer)!;
  const busy = useGame((s) => s.busy);
  const saveError = useGame((s) => s.saveError);
  const playNextRound = useGame((s) => s.playNextRound);
  const simulateToEnd = useGame((s) => s.simulateToEnd);
  const nextSeason = useGame((s) => s.nextSeason);
  const openMatch = useGame((s) => s.openMatch);
  const backToMenu = useGame((s) => s.backToMenu);
  const setTab = useGame((s) => s.setTab);

  const { season, clubs, userClubId, players } = career;
  const club = clubs[userClubId]!;
  const over = isWorldSeasonOver(season);
  const league = userLeague(career);
  const next = nextFixtureOf(season, userClubId);
  const upcoming = useMemo(() => upcomingOf(season, userClubId, 6).slice(1), [season, userClubId]);
  const recent = useMemo(() => resultsOf(season, userClubId).slice(-5).reverse(), [season, userClubId]);
  // Antes da 1ª rodada a ordem da tabela é só o desempate final (id), então não vale mostrar.
  const started = (league?.results.length ?? 0) > 0;
  const pos = positionOf(season, userClubId);
  const row = league?.table[pos - 1];

  const absent = useMemo(
    () =>
      club.squad
        .map((id) => ({ p: players[id]!, st: season.status[id] }))
        .filter((x) => x.p && x.st && x.st.out > 0),
    [club.squad, players, season.status],
  );
  const expiring = useMemo(
    () => club.squad.map((id) => players[id]!).filter((p) => p && !p.loan && p.contract.expires === season.year),
    [club.squad, players, season.year],
  );

  const opponentId = next ? (next.fx.homeId === userClubId ? next.fx.awayId : next.fx.homeId) : null;
  const opponent = opponentId ? clubs[opponentId] : null;
  const last = career.history.find((h) => h.year === season.year);
  // Títulos do usuário na carreira, por competição.
  const titles = useMemo(() => {
    const out: string[] = [];
    for (const h of career.history) {
      for (const [compId, winner] of Object.entries(h.winners ?? {})) {
        if (winner === userClubId) out.push(`${h.year} ${compName(compId)}`);
      }
    }
    return out;
  }, [career.history, userClubId]);
  function compName(compId: string): string {
    return season.competitions[compId]?.name ?? career.leagues[compId]?.name ?? compId;
  }

  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header
        title={club.name}
        subtitle={`Temporada ${season.year} · ${league?.name ?? ''} · ${roundLabel(season)}`}
        right={<Button variant="ghost" label="Menu" onPress={backToMenu} />}
      />

      {saveError ? (
        <Card className="border-red-300 dark:border-red-800">
          <Muted>{saveError}</Muted>
        </Card>
      ) : null}

      {over ? (
        <Card>
          <SectionTitle>Temporada encerrada</SectionTitle>
          <Strong>Campeão: {clubs[league?.table[0]?.clubId ?? '']?.name}</Strong>
          <Muted className="mt-1">
            {club.name} terminou em {last?.userPosition ?? pos}º com {last?.userPoints ?? row?.points} pontos.
          </Muted>
          {Object.values(season.competitions)
            .filter((comp) => comp.kind !== 'league' && comp.clubIds.includes(userClubId))
            .map((comp) => (
              <Muted key={comp.id}>
                {comp.name}: campeão {clubs[comp.championId ?? '']?.name ?? '—'}
              </Muted>
            ))}
          <Button className="mt-3" label={`Começar temporada ${season.year + 1}`} loading={busy} onPress={nextSeason} />
        </Card>
      ) : next && opponent ? (
        <Card>
          <SectionTitle>Próximo jogo · {stageLabel(next.comp, next.fx)}</SectionTitle>
          <Strong>
            {next.fx.neutral ? 'x' : next.fx.homeId === userClubId ? 'vs' : '@'} {opponent.name}
          </Strong>
          <Muted>
            {next.fx.neutral ? 'Campo neutro' : next.fx.homeId === userClubId ? 'Em casa' : 'Fora'}
            {started && next.comp.kind === 'league' ? ` · adversário em ${positionOf(season, opponent.id)}º` : ''}
            {!opponent.squad.length ? ` · ${career.leagues[opponent.leagueId]?.name ?? 'divisão inferior'}` : ''}
          </Muted>
          <View className="mt-3 gap-2">
            <Button label="Jogar próxima partida" loading={busy} onPress={playNextRound} />
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="secondary" label="Escalação" onPress={() => setTab('escalacao')} />
              <Button className="flex-1" variant="secondary" label="Simular resto" disabled={busy} onPress={simulateToEnd} />
            </View>
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Mercado</SectionTitle>
        <Muted>{windowLabel(season)}</Muted>
        {career.inbox.length > 0 ? (
          <Strong className="mt-1">
            {career.inbox.length} proposta{career.inbox.length > 1 ? 's' : ''} pelos seus jogadores
          </Strong>
        ) : null}
        {expiring.length > 0 ? (
          <Muted className="mt-1">
            {expiring.length} contrato{expiring.length > 1 ? 's terminam' : ' termina'} no fim da temporada: {expiring.slice(0, 3).map((p) => p.name).join(', ')}
            {expiring.length > 3 ? '…' : ''}
          </Muted>
        ) : null}
        {career.preContracts.length > 0 ? (
          <Muted className="mt-1">
            Pré-contratos: {career.preContracts.map((pc) => players[pc.playerId]?.name).join(', ')} (chegam na próxima temporada)
          </Muted>
        ) : null}
        <View className="mt-2 flex-row gap-2">
          <Button className="flex-1" variant="secondary" label="Mercado" onPress={() => setTab('mercado')} />
          {expiring.length > 0 ? <Button className="flex-1" variant="secondary" label="Renovar" onPress={() => setTab('elenco')} /> : null}
        </View>
      </Card>

      {absent.length > 0 ? (
        <Card>
          <SectionTitle>Desfalques</SectionTitle>
          {absent.map(({ p, st }) => (
            <View key={p.id} className="flex-row items-center justify-between py-1">
              <Text className="flex-1 text-slate-900 dark:text-slate-100" numberOfLines={1}>
                {p.name}
              </Text>
              <Badge
                tone={st!.reason === 'injury' ? 'bad' : 'warn'}
                label={`${st!.reason === 'injury' ? 'Lesão' : 'Suspenso'} · ${st!.out} jogo${st!.out > 1 ? 's' : ''}`}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Na tabela · {league?.name}</SectionTitle>
        <View className="flex-row items-baseline gap-3">
          <Text className="text-4xl font-black text-slate-900 dark:text-white">{started ? `${pos}º` : '—'}</Text>
          <Muted>
            {row?.points ?? 0} pts · {row?.wins ?? 0}V {row?.draws ?? 0}E {row?.losses ?? 0}D · saldo{' '}
            {(row?.goalsFor ?? 0) - (row?.goalsAgainst ?? 0)}
          </Muted>
        </View>
        <Button className="mt-2" variant="ghost" label="Ver tabela" onPress={() => setTab('liga')} />
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <SectionTitle>Depois</SectionTitle>
          {upcoming.map(({ fx, comp }) => {
            const oppId = fx.homeId === userClubId ? fx.awayId : fx.homeId;
            return (
              <View key={fx.id} className="flex-row items-center justify-between py-1">
                <Text className="flex-1 text-sm text-slate-900 dark:text-slate-100" numberOfLines={1}>
                  {fx.homeId === userClubId ? 'vs' : '@'} {clubs[oppId]?.name}
                </Text>
                <Muted className="ml-2 text-xs">{comp.kind === 'league' ? `R${fx.round}` : comp.name}</Muted>
              </View>
            );
          })}
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card>
          <SectionTitle>Últimos resultados</SectionTitle>
          {recent.map(({ result: r, comp }) => {
            const home = r.homeId === userClubId;
            const opp = clubs[home ? r.awayId : r.homeId];
            const o = outcomeFor(r, userClubId);
            return (
              <Pressable
                key={r.fixtureId}
                accessibilityRole="button"
                onPress={() => openMatch(r.fixtureId)}
                className="flex-row items-center gap-3 rounded-lg py-2 active:bg-slate-100 dark:active:bg-slate-800"
              >
                <Badge tone={OUTCOME_TONE[o]} label={o} />
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-slate-100" numberOfLines={1}>
                    {home ? 'vs' : '@'} {opp?.name}
                  </Text>
                  {comp.kind !== 'league' ? <Muted className="text-xs">{comp.name}</Muted> : null}
                </View>
                <Text className="font-bold text-slate-900 dark:text-white">
                  {home ? `${r.homeGoals} x ${r.awayGoals}` : `${r.awayGoals} x ${r.homeGoals}`}
                  {r.shootoutWinnerId ? ' (pên.)' : ''}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {career.history.length > 0 ? (
        <Card>
          <SectionTitle>Histórico</SectionTitle>
          {career.history
            .slice()
            .reverse()
            .map((h) => (
              <Muted key={h.year}>
                {h.year}: {h.userPosition}º na {career.leagues[h.leagueId]?.name ?? 'liga'} com {h.userPoints} pts · campeão {clubs[h.championId]?.shortName}
              </Muted>
            ))}
          {titles.length > 0 ? <Strong className="mt-2">Títulos: {titles.join(' · ')}</Strong> : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}
