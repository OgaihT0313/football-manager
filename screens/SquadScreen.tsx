// Elenco: jogadores por posição, com OVR, condição, situação e estatísticas da temporada.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { formatMoney, formatWage, POS_LABEL, POS_ORDER } from '../components/labels';
import { NegotiationSheet } from '../components/NegotiationSheet';
import { Badge, Button, FitnessBar, Muted } from '../components/ui';
import { playerStats } from '../src/career/queries';
import { loanOut, releasePlayer } from '../src/career/userMarket';
import { openWindow } from '../src/market/calendar';
import { releaseCost } from '../src/market/transfers';
import type { Player } from '../src/domain/types';
import { selectCareer, useGame } from '../store/gameStore';

export function SquadScreen() {
  const career = useGame(selectCareer)!;
  const { season, players, clubs, userClubId } = career;
  const club = clubs[userClubId]!;
  const [open, setOpen] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const market = useGame((s) => s.market);
  const windowOpen = !!openWindow(season);
  const loanedIn = (p: Player) => !!p.loan;

  const stats = useMemo(() => playerStats(season), [season]);
  const list = useMemo(
    () =>
      club.squad
        .map((id) => players[id])
        .filter((p): p is Player => !!p)
        .sort((a, b) => POS_ORDER[a.positions[0]!] - POS_ORDER[b.positions[0]!] || b.ovr - a.ovr),
    [club.squad, players],
  );

  return (
    <View className="flex-1">
      <Header title="Elenco" subtitle={`${list.length} jogadores · toque para ver detalhes e contrato`} />
      <View className="flex-row px-4 pb-1">
        <Text className="w-10 text-xs font-bold text-slate-500">POS</Text>
        <Text className="flex-1 text-xs font-bold text-slate-500">JOGADOR</Text>
        <Text className="w-14 text-center text-xs font-bold text-slate-500">COND.</Text>
        <Text className="w-10 text-right text-xs font-bold text-slate-500">OVR</Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerClassName="px-4 pb-6"
        renderItem={({ item: p }) => {
          const st = season.status[p.id];
          const s = stats[p.id];
          const starter = club.startingXI.includes(p.id);
          const expanded = open === p.id;
          return (
            <View className="border-b border-slate-200 py-2.5 dark:border-slate-800">
              {/* Só a linha é clicável: os botões do painel não podem ficar dentro de outro botão. */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => {
                  setOpen(expanded ? null : p.id);
                  setActionMsg(null);
                  setConfirmRelease(null);
                }}
                className="flex-row items-center"
              >
                <Text className="w-10 text-xs font-bold text-slate-600 dark:text-slate-300">{POS_LABEL[p.positions[0]!]}</Text>
                <View className="flex-1 flex-row items-center gap-1.5">
                  <Text className={`shrink text-slate-900 dark:text-slate-100 ${starter ? 'font-semibold' : ''}`} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {starter ? <Badge tone="good" label="XI" /> : null}
                  {st && st.out > 0 ? <Badge tone={st.reason === 'injury' ? 'bad' : 'warn'} label={st.reason === 'injury' ? `Lesão ${st.out}` : 'Susp.'} /> : null}
                </View>
                <View className="w-14 items-center">
                  <FitnessBar value={p.fitness ?? 100} />
                </View>
                <Text className="w-10 text-right text-base font-bold text-slate-900 dark:text-white">{p.ovr}</Text>
              </Pressable>
              {expanded ? (
                <View className="mt-2 gap-1 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                  <Muted>
                    {p.age} anos · {p.nationality} · pé {p.foot === 'L' ? 'esquerdo' : p.foot === 'R' ? 'direito' : 'ambos'} ·{' '}
                    {p.positions.map((x) => POS_LABEL[x]).join('/')}
                  </Muted>
                  <Muted>
                    Ataque {p.attack} · Criação {p.creation} · Defesa {p.defending} · Físico {p.physical}
                    {p.positions[0] === 'GK' ? ` · Goleiro ${p.goalkeeping}` : ''}
                  </Muted>
                  <Muted>
                    Potencial {p.potential} · valor {formatMoney(p.value)} · contrato até {p.contract.expires} · condição{' '}
                    {Math.round(p.fitness ?? 100)}%
                  </Muted>
                  <Muted>
                    Temporada: {s?.apps ?? 0} jogos · {s?.goals ?? 0} gols · {s?.assists ?? 0} assist. · {st?.yellows ?? 0} amarelos
                    {s?.avgRating != null ? ` · nota ${s.avgRating.toFixed(1)}` : ''}
                  </Muted>
                  <Muted>
                    Salário {formatWage(p.contract.wage)}
                    {p.contract.releaseClause ? ` · multa rescisória ${formatMoney(p.contract.releaseClause)}` : ''}
                    {p.contract.expires === season.year ? ' · contrato termina nesta temporada' : ''}
                  </Muted>
                  {loanedIn(p) ? (
                    <Muted>Emprestado por {clubs[p.loan!.parentClubId]?.name} até o fim de {p.loan!.until}.</Muted>
                  ) : confirmRelease === p.id ? (
                    <View className="mt-2 gap-2">
                      <Muted>Dispensar custa {formatMoney(releaseCost(p, season.year))} (metade dos salários restantes).</Muted>
                      <View className="flex-row gap-2">
                        <Button className="flex-1" variant="secondary" label="Cancelar" onPress={() => setConfirmRelease(null)} />
                        <Button
                          className="flex-1"
                          variant="danger"
                          label="Dispensar"
                          onPress={() => {
                            const r = market((c) => releasePlayer(c, p.id));
                            setActionMsg(r.ok ? null : r.message);
                            setConfirmRelease(null);
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      <Button className="flex-1" variant="secondary" label="Renovar" onPress={() => setRenewing(p.id)} />
                      <Button
                        className="flex-1"
                        variant="secondary"
                        label="Emprestar"
                        disabled={!windowOpen}
                        onPress={() => {
                          const r = market((c) => loanOut(c, p.id));
                          setActionMsg(r.ok ? null : r.message);
                        }}
                      />
                      <Button className="flex-1" variant="ghost" label="Dispensar" onPress={() => setConfirmRelease(p.id)} />
                    </View>
                  )}
                  {actionMsg ? <Muted className="text-amber-700 dark:text-amber-300">{actionMsg}</Muted> : null}
                </View>
              ) : null}
            </View>
          );
        }}
      />
      {renewing ? <NegotiationSheet playerId={renewing} mode="renovar" onClose={() => setRenewing(null)} /> : null}
    </View>
  );
}
