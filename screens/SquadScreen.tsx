// Elenco: jogadores por setor com OVR, condição e situação; ficha do jogador com atributos,
// números da temporada e ações (renovar, emprestar, dispensar).
// Celular: lista compacta e ficha numa folha. PC: tabela completa e ficha num painel ao lado.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { formatMoney, formatWage, POS_GROUP, POS_GROUPS, POS_LABEL, POS_ORDER, type PosGroup } from '../components/labels';
import { NegotiationSheet } from '../components/NegotiationSheet';
import { Sheet } from '../components/Sheet';
import { useWide } from '../components/theme';
import { Button, Card, Chips, CondBar, Label, Muted, Num, OvrBadge, Title } from '../components/ui';
import { playerStats, type PlayerSeasonStats } from '../src/career/queries';
import { loanOut, releasePlayer } from '../src/career/userMarket';
import { openWindow } from '../src/market/calendar';
import { releaseCost } from '../src/market/transfers';
import type { Player } from '../src/domain/types';
import type { CareerState } from '../src/career/career';
import { selectCareer, useGame } from '../store/gameStore';

/** Linha de status: lesão/suspensão (vermelho), destaque (âmbar) ou idade. */
function statusOf(p: Player, c: CareerState, stats: Record<string, PlayerSeasonStats>, topScorer: string | null): { text: string; tone: 'neg' | 'acct' | 'mute' } {
  const st = c.season.status[p.id];
  if (st && st.out > 0) return { text: `${st.reason === 'injury' ? 'Lesionado' : 'Suspenso'} · ${st.out} jogo${st.out > 1 ? 's' : ''}`, tone: 'neg' };
  if (p.loan) return { text: `Emprestado por ${c.clubs[p.loan.parentClubId]?.shortName ?? '?'}`, tone: 'acct' };
  if (p.id === topScorer) return { text: `Artilheiro · ${stats[p.id]!.goals} gols`, tone: 'acct' };
  if ((p.fitness ?? 100) < 75) return { text: 'Cansado', tone: 'acct' };
  if (p.contract.expires === c.season.year) return { text: `${p.age} anos · contrato acaba`, tone: 'acct' };
  return { text: `${p.age} anos`, tone: 'mute' };
}

const TONE_TEXT = { neg: 'text-neg', acct: 'text-acct', mute: 'text-mute' } as const;

export function SquadScreen() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const { season, players, clubs, userClubId } = career;
  const club = clubs[userClubId]!;
  const [group, setGroup] = useState<PosGroup>('Todos');
  const [selected, setSelected] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);

  const stats = useMemo(() => playerStats(season), [season]);
  const all = useMemo(
    () =>
      club.squad
        .map((id) => players[id])
        .filter((p): p is Player => !!p)
        .sort((a, b) => POS_ORDER[a.positions[0]!] - POS_ORDER[b.positions[0]!] || b.ovr - a.ovr),
    [club.squad, players],
  );
  const list = group === 'Todos' ? all : all.filter((p) => POS_GROUP[p.positions[0]!] === group);
  const topScorer = useMemo(() => {
    const best = all.slice().sort((a, b) => (stats[b.id]?.goals ?? 0) - (stats[a.id]?.goals ?? 0))[0];
    return best && (stats[best.id]?.goals ?? 0) > 0 ? best.id : null;
  }, [all, stats]);
  const avg = all.length ? Math.round(all.reduce((a, p) => a + p.ovr, 0) / all.length) : 0;
  const avgAge = all.length ? (all.reduce((a, p) => a + p.age, 0) / all.length).toFixed(1).replace('.', ',') : '0';
  const current = (selected && players[selected]?.clubId === userClubId ? players[selected] : null) ?? (wide ? list[0] ?? null : null);

  if (wide) {
    return (
      <View className="flex-1 flex-row gap-8 px-12 py-9">
        <View className="flex-1">
          <View className="flex-row items-baseline gap-5 pb-4">
            <Title size={40}>Elenco</Title>
            <Text className="font-mono text-xs uppercase text-mute">
              {all.length} jogadores · média {avg} · idade {avgAge}
            </Text>
            <View className="ml-auto">
              <Chips options={POS_GROUPS} value={group} onChange={setGroup} />
            </View>
          </View>
          <View className="flex-row gap-3 border-b border-line px-4 pb-2.5">
            {(['POS', 'JOGADOR', 'IDADE', 'OVR', 'POT', 'CONDIÇÃO', 'GOLS', 'VALOR', 'CONTRATO'] as const).map((h) => (
              <Text key={h} className={`font-monom text-[10.5px] tracking-[0.8px] text-mute ${WIDE_COL[h]}`}>
                {h}
              </Text>
            ))}
          </View>
          <FlatList
            data={list}
            keyExtractor={(p) => p.id}
            renderItem={({ item: p }) => {
              const s = statusOf(p, career, stats, topScorer);
              const active = current?.id === p.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelected(p.id)}
                  className={`h-[50px] flex-row items-center gap-3 border-b border-line px-4 ${active ? 'rounded-[10px] bg-s1' : 'active:bg-s2'}`}
                >
                  <Text className={`font-monob text-xs text-mute ${WIDE_COL.POS}`}>{POS_LABEL[p.positions[0]!]}</Text>
                  <View className={WIDE_COL.JOGADOR}>
                    <Text className="font-sanss text-[14.5px] text-ink" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className={`font-sans text-[11.5px] ${TONE_TEXT[s.tone]}`} numberOfLines={1}>
                      {s.text}
                    </Text>
                  </View>
                  <Text className={`font-mono text-[13px] text-ink ${WIDE_COL.IDADE}`}>{p.age}</Text>
                  <View className={WIDE_COL.OVR}>
                    <OvrBadge ovr={p.ovr} w={38} h={28} size={17} />
                  </View>
                  <Text className={`font-mono text-[13px] text-mute ${WIDE_COL.POT}`}>{p.potential}</Text>
                  <View className={`flex-row items-center gap-2.5 ${WIDE_COL['CONDIÇÃO']}`}>
                    <CondBar value={p.fitness ?? 100} width={64} height={4} />
                    <Text className="font-monom text-xs text-ink">{Math.round(p.fitness ?? 100)}%</Text>
                  </View>
                  <Text className={`font-mono text-[13px] text-ink ${WIDE_COL.GOLS}`}>{stats[p.id]?.goals ?? 0}</Text>
                  <Text className={`text-right font-monom text-[13px] text-ink ${WIDE_COL.VALOR}`}>{formatMoney(p.value)}</Text>
                  <Text className={`text-right font-mono text-[13px] text-mute ${WIDE_COL.CONTRATO}`}>{p.contract.expires}</Text>
                </Pressable>
              );
            }}
          />
        </View>
        <View className="w-[360px]">
          {current ? <PlayerCard key={current.id} p={current} stats={stats[current.id]} onRenew={() => setRenewing(current.id)} wide /> : null}
        </View>
        {renewing ? <NegotiationSheet playerId={renewing} mode="renovar" onClose={() => setRenewing(null)} /> : null}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="gap-2.5 px-[18px] pb-2.5 pt-2">
        <View className="flex-row items-baseline justify-between">
          <Title>Elenco</Title>
          <Text className="font-mono text-[11px] uppercase text-mute">
            {all.length} jogadores · méd {avg}
          </Text>
        </View>
        <Chips options={POS_GROUPS} value={group} onChange={setGroup} />
      </View>
      <View className="flex-row gap-2 border-b border-line px-[18px] py-1.5">
        <Text className="w-[38px] font-monom text-[10px] tracking-[0.8px] text-mute">POS</Text>
        <Text className="flex-1 font-monom text-[10px] tracking-[0.8px] text-mute">JOGADOR</Text>
        <Text className="w-10 text-center font-monom text-[10px] tracking-[0.8px] text-mute">OVR</Text>
        <Text className="w-[54px] text-right font-monom text-[10px] tracking-[0.8px] text-mute">COND</Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerClassName="pb-6"
        renderItem={({ item: p }) => {
          const s = statusOf(p, career, stats, topScorer);
          const cond = Math.round(p.fitness ?? 100);
          return (
            <Pressable accessibilityRole="button" onPress={() => setSelected(p.id)} className="flex-row items-center gap-2 border-b border-line px-[18px] py-[9px] active:bg-s2">
              <Text className="w-[38px] font-monob text-[11px] text-mute">{POS_LABEL[p.positions[0]!]}</Text>
              <View className="min-w-0 flex-1 gap-px">
                <Text className="font-sanss text-[13.5px] text-ink" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text className={`font-sans text-[11px] ${TONE_TEXT[s.tone]}`} numberOfLines={1}>
                  {s.text}
                </Text>
              </View>
              <View className="w-10 items-center">
                <OvrBadge ovr={p.ovr} />
              </View>
              <View className="w-[54px] items-end gap-1">
                <Text className="font-monom text-[10.5px] text-ink">{cond}%</Text>
                <CondBar value={cond} />
              </View>
            </Pressable>
          );
        }}
      />
      {current ? (
        <Sheet title={current.name} onClose={() => setSelected(null)}>
          <PlayerCard key={current.id} p={current} stats={stats[current.id]} onRenew={() => setRenewing(current.id)} />
        </Sheet>
      ) : null}
      {renewing ? <NegotiationSheet playerId={renewing} mode="renovar" onClose={() => setRenewing(null)} /> : null}
    </View>
  );
}

const WIDE_COL = {
  POS: 'w-[60px]',
  JOGADOR: 'flex-[1.6]',
  IDADE: 'w-[60px]',
  OVR: 'w-[70px]',
  POT: 'w-[60px]',
  'CONDIÇÃO': 'flex-1 min-w-[120px]',
  GOLS: 'w-[60px]',
  VALOR: 'w-[100px] text-right',
  CONTRATO: 'w-[90px] text-right',
} as const;

/** Ficha do jogador: atributos, temporada, contrato e ações. */
function PlayerCard({ p, stats, onRenew, wide = false }: { p: Player; stats?: PlayerSeasonStats; onRenew: () => void; wide?: boolean }) {
  const career = useGame(selectCareer)!;
  const market = useGame((s) => s.market);
  const { season, clubs } = career;
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const windowOpen = !!openWindow(season);
  const attrs: [string, number][] = [
    ['Ataque', p.attack],
    ['Criação', p.creation],
    ['Defesa', p.defending],
    ['Físico', p.physical],
    ...(p.positions[0] === 'GK' ? ([['Goleiro', p.goalkeeping]] as [string, number][]) : []),
    ['Potencial', p.potential],
  ];
  const first = p.name.split(' ')[0];
  const rest = p.name.split(' ').slice(1).join(' ');

  const body = (
    <View className="gap-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 gap-1">
          <Label>
            {p.positions.map((x) => POS_LABEL[x]).join('/')} · {p.age} anos · {p.nationality}
          </Label>
          {wide ? (
            <Num size={40} black className="uppercase">
              {first}
              {rest ? `\n${rest}` : ''}
            </Num>
          ) : null}
        </View>
        <OvrBadge ovr={p.ovr} w={60} h={52} size={32} />
      </View>
      <View className="gap-2.5">
        {attrs.map(([k, v]) => (
          <View key={k} className="flex-row items-center gap-2.5">
            <Text className="w-[90px] font-sans text-[13px] text-mute">{k}</Text>
            <View className="h-[5px] flex-1 overflow-hidden rounded bg-s2">
              <View className={`h-full rounded ${v >= 80 ? 'bg-acc' : v >= 65 ? 'bg-pos' : 'bg-mute'}`} style={{ width: `${v}%` }} />
            </View>
            <Text className="w-[30px] text-right font-monob text-[13px] text-ink">{v}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row border-t border-line pt-3">
        {[
          ['Jogos', String(stats?.apps ?? 0)],
          ['Gols', String(stats?.goals ?? 0)],
          ['Assist.', String(stats?.assists ?? 0)],
          ['Nota', stats?.avgRating != null ? stats.avgRating.toFixed(1).replace('.', ',') : '–'],
        ].map(([k, v]) => (
          <View key={k} className="flex-1">
            <Label className="text-[10px]">{k}</Label>
            <Num size={26}>{v}</Num>
          </View>
        ))}
      </View>
      <View className="gap-1">
        <Muted className="text-[12.5px]">
          Valor {formatMoney(p.value)} · salário {formatWage(p.contract.wage)} · contrato até {p.contract.expires}
        </Muted>
        {p.contract.releaseClause ? <Muted className="text-[12.5px]">Multa rescisória {formatMoney(p.contract.releaseClause)}</Muted> : null}
        <Muted className="text-[12.5px]">
          Pé {p.foot === 'L' ? 'esquerdo' : p.foot === 'R' ? 'direito' : 'ambos'} · condição {Math.round(p.fitness ?? 100)}% · moral {Math.round(p.morale ?? 50)}
        </Muted>
      </View>
      {p.loan ? (
        <Muted>
          Emprestado por {clubs[p.loan.parentClubId]?.name} até o fim de {p.loan.until}.
        </Muted>
      ) : confirmRelease ? (
        <View className="gap-2">
          <Muted>Dispensar custa {formatMoney(releaseCost(p, season.year))} (metade dos salários restantes).</Muted>
          <View className="flex-row gap-2">
            <Button className="flex-1" variant="secondary" label="Cancelar" onPress={() => setConfirmRelease(false)} />
            <Button
              className="flex-1"
              variant="danger"
              label="Dispensar"
              onPress={() => {
                const r = market((c) => releasePlayer(c, p.id));
                setMsg(r.ok ? null : r.message);
                setConfirmRelease(false);
              }}
            />
          </View>
        </View>
      ) : (
        <View className="gap-2">
          <View className="flex-row gap-2.5">
            <Button className="flex-1" variant="secondary" label="Renovar" onPress={onRenew} />
            <Button
              className="flex-1"
              variant="secondary"
              label="Emprestar"
              disabled={!windowOpen}
              onPress={() => {
                const r = market((c) => loanOut(c, p.id));
                setMsg(r.ok ? null : r.message);
              }}
            />
          </View>
          <Button variant="ghost" size="sm" label="Dispensar" onPress={() => setConfirmRelease(true)} />
        </View>
      )}
      {msg ? <Text className="font-sans text-[13px] text-acct">{msg}</Text> : null}
    </View>
  );

  if (!wide) return body;
  return (
    <Card className="flex-1 rounded-[18px] p-7">
      <ScrollView>{body}</ScrollView>
    </Card>
  );
}
