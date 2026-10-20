// Início: próximo jogo, jogar rodada, simular, últimos resultados e situação na tabela.

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { Badge, Button, Card, Muted, SectionTitle, Strong } from '../components/ui';
import { isSeasonOver } from '../src/competitions/season';
import { nextFixtureOf, outcomeFor, positionOf, resultsOf } from '../src/career/queries';
import { windowLabel } from '../src/market/calendar';
import { selectCareer, useGame } from '../store/gameStore';

const OUTCOME_TONE = { V: 'good', E: 'neutral', D: 'bad' } as const;

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
  const over = isSeasonOver(season);
  const next = nextFixtureOf(season, userClubId);
  const recent = useMemo(() => resultsOf(season, userClubId).slice(-5).reverse(), [season, userClubId]);
  // Antes da 1ª rodada a ordem da tabela é só o desempate final (id), então não vale mostrar.
  const started = season.results.length > 0;
  const pos = positionOf(season, userClubId);
  const row = season.table[pos - 1];

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

  const opponentId = next ? (next.homeId === userClubId ? next.awayId : next.homeId) : null;
  const opponent = opponentId ? clubs[opponentId] : null;
  const last = career.history.find((h) => h.year === season.year);

  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header
        title={club.name}
        subtitle={`Temporada ${season.year} · rodada ${Math.min(season.nextRound, season.totalRounds)}/${season.totalRounds}`}
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
          <Strong>Campeão: {clubs[season.table[0]!.clubId]?.name}</Strong>
          <Muted className="mt-1">
            {club.name} terminou em {last?.userPosition ?? pos}º com {last?.userPoints ?? row?.points} pontos.
          </Muted>
          <Button className="mt-3" label={`Começar temporada ${season.year + 1}`} loading={busy} onPress={nextSeason} />
        </Card>
      ) : next && opponent ? (
        <Card>
          <SectionTitle>Próximo jogo · rodada {next.round}</SectionTitle>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Strong>
                {next.homeId === userClubId ? 'vs' : '@'} {opponent.name}
              </Strong>
              <Muted>
                {next.homeId === userClubId ? 'Em casa' : 'Fora'}
                {started ? ` · adversário em ${positionOf(season, opponent.id)}º` : ''}
              </Muted>
            </View>
          </View>
          <View className="mt-3 gap-2">
            <Button label="Jogar rodada" loading={busy} onPress={playNextRound} />
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
        <SectionTitle>Na tabela</SectionTitle>
        <View className="flex-row items-baseline gap-3">
          <Text className="text-4xl font-black text-slate-900 dark:text-white">{started ? `${pos}º` : '—'}</Text>
          <Muted>
            {row?.points ?? 0} pts · {row?.wins ?? 0}V {row?.draws ?? 0}E {row?.losses ?? 0}D · saldo{' '}
            {(row?.goalsFor ?? 0) - (row?.goalsAgainst ?? 0)}
          </Muted>
        </View>
        <Button className="mt-2" variant="ghost" label="Ver tabela" onPress={() => setTab('liga')} />
      </Card>

      {recent.length > 0 ? (
        <Card>
          <SectionTitle>Últimos resultados</SectionTitle>
          {recent.map((r) => {
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
                <Text className="flex-1 text-slate-900 dark:text-slate-100" numberOfLines={1}>
                  {home ? 'vs' : '@'} {opp?.name}
                </Text>
                <Text className="font-bold text-slate-900 dark:text-white">
                  {home ? `${r.homeGoals} x ${r.awayGoals}` : `${r.awayGoals} x ${r.homeGoals}`}
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
                {h.year}: {h.userPosition}º com {h.userPoints} pts · campeão {clubs[h.championId]?.shortName}
              </Muted>
            ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
