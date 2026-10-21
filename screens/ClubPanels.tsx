// Aba Clube › Staff (equipe técnica, mercado de staff e olheiro) e › Carreira (técnico,
// passagens, títulos, conquistas e prêmios da temporada).

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Header } from '../components/Header';
import { formatWage } from '../components/labels';
import { Badge, Button, Card, Muted, SectionTitle, Strong } from '../components/ui';
import { myProspects } from '../src/career/managerCareer';
import { staffBudget, staffWeekly } from '../src/club/finance';
import { ACHIEVEMENTS } from '../src/manager/awards';
import { ROLE_EFFECT, ROLE_LABEL, SCOUT_REGIONS, STAFF_ROLES, type ScoutRegion } from '../src/manager/staff';
import { selectCareer, useGame } from '../store/gameStore';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function StaffView() {
  const career = useGame(selectCareer)!;
  const hire = useGame((s) => s.hire);
  const scout = useGame((s) => s.scout);
  const setTab = useGame((s) => s.setTab);
  const [msg, setMsg] = useState<string | null>(null);
  const [region, setRegion] = useState<ScoutRegion>(SCOUT_REGIONS[0]);
  const club = career.clubs[career.userClubId]!;
  const prospects = myProspects(career);
  const wait = career.scoutReadySlot - career.season.nextSlot;

  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header title="Staff" subtitle={`Folha do staff ${formatWage(staffWeekly(club))} de ${formatWage(staffBudget(club))} (orçamento da diretoria)`} />
      {msg ? (
        <Card className="border-amber-300 dark:border-amber-700">
          <Muted>{msg}</Muted>
        </Card>
      ) : null}
      {STAFF_ROLES.map((role) => {
        const m = club.staff?.[role];
        const options = career.staffMarket.filter((s) => s.role === role).sort((a, b) => b.level - a.level);
        return (
          <Card key={role}>
            <SectionTitle>{ROLE_LABEL[role]}</SectionTitle>
            <Muted className="text-xs">{ROLE_EFFECT[role]}</Muted>
            {m ? (
              <View className="mt-1 flex-row items-center justify-between">
                <Strong>{m.name}</Strong>
                <Text className="text-amber-500">{stars(m.level)}</Text>
              </View>
            ) : (
              <Muted>Cargo vago.</Muted>
            )}
            {m ? <Muted className="text-xs">{formatWage(m.wage)}</Muted> : null}
            {options.length ? <Muted className="mt-2 text-xs">Disponíveis nesta temporada:</Muted> : null}
            {options.map((o) => (
              <View key={o.id} className="flex-row items-center justify-between py-1">
                <View className="flex-1">
                  <Text className="text-sm text-slate-900 dark:text-slate-100">
                    {o.name} <Text className="text-amber-500">{stars(o.level)}</Text>
                  </Text>
                  <Muted className="text-xs">{formatWage(o.wage)}</Muted>
                </View>
                <Button
                  variant="secondary"
                  label="Contratar"
                  onPress={() => {
                    const r = hire(o.id);
                    setMsg(r.ok ? null : r.message);
                  }}
                />
              </View>
            ))}
          </Card>
        );
      })}

      <Card>
        <SectionTitle>Missão do olheiro</SectionTitle>
        <Muted>Ele traz 3 jovens de 16 a 18 anos da região; quanto melhor o olheiro, maior o potencial. Eles aparecem em Mercado › Livres, só para você.</Muted>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {SCOUT_REGIONS.map((r) => (
            <Button key={r} variant={r === region ? 'primary' : 'secondary'} label={r} onPress={() => setRegion(r)} />
          ))}
        </View>
        <Button
          className="mt-2"
          label={wait > 0 ? `Olheiro em missão (volta em ${wait} data(s))` : `Enviar para ${region}`}
          disabled={wait > 0}
          onPress={() => {
            const r = scout(region);
            setMsg(r.ok ? null : r.message);
          }}
        />
        {prospects.length ? (
          <View className="mt-2">
            <Muted className="text-xs">Prospectos à disposição:</Muted>
            {prospects.map((p) => (
              <Muted key={p.id}>
                {p.name} · {p.age} anos · {p.nationality} · OVR {p.ovr} · potencial ~{p.potential}
              </Muted>
            ))}
            <Button className="mt-2" variant="ghost" label="Ver no mercado" onPress={() => setTab('mercado')} />
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

export function CareerView() {
  const career = useGame(selectCareer)!;
  const { manager, clubs, season } = career;
  const last = career.awards[career.awards.length - 1];
  const totals = manager.spells.reduce((a, s) => ({ m: a.m + s.matches, w: a.w + s.wins, d: a.d + s.draws, l: a.l + s.losses }), { m: 0, w: 0, d: 0, l: 0 });
  const compName = (id: string) => season.competitions[id]?.name ?? career.leagues[id]?.name ?? id;

  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header title={manager.name} subtitle={`Reputação ${manager.reputation}/100 · ${totals.m} jogos (${totals.w}V ${totals.d}E ${totals.l}D)`} />

      <Card>
        <SectionTitle>Passagens</SectionTitle>
        {manager.spells
          .slice()
          .reverse()
          .map((s, i) => (
            <View key={i} className="border-b border-slate-100 py-2 dark:border-slate-800">
              <View className="flex-row items-center justify-between">
                <Strong className="flex-1">{clubs[s.clubId]?.name}</Strong>
                {s.end === 'demitido' ? <Badge tone="bad" label="Demitido" /> : s.end === 'saiu' ? <Badge label="Saiu" /> : <Badge tone="good" label="Atual" />}
              </View>
              <Muted className="text-xs">
                {s.fromYear}–{s.toYear ?? 'hoje'} · {s.matches} jogos ({s.wins}V {s.draws}E {s.losses}D)
              </Muted>
              {s.titles.length ? <Muted className="text-xs">🏆 {s.titles.join(', ')}</Muted> : null}
            </View>
          ))}
      </Card>

      <Card>
        <SectionTitle>Conquistas ({manager.achievements.length}/{ACHIEVEMENTS.length})</SectionTitle>
        {ACHIEVEMENTS.map((a) => {
          const got = manager.achievements.includes(a.id);
          return (
            <View key={a.id} className={`py-1 ${got ? '' : 'opacity-40'}`}>
              <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {got ? '✓ ' : ''}
                {a.label}
              </Text>
              <Muted className="text-xs">{a.description}</Muted>
            </View>
          );
        })}
      </Card>

      {last ? (
        <Card>
          <SectionTitle>Prêmios {last.year}</SectionTitle>
          {last.list.map((a) => (
            <View key={a.competitionId} className="py-1.5">
              <Strong className="text-sm">{compName(a.competitionId)}</Strong>
              {a.artilheiro ? (
                <Muted className="text-xs">
                  Artilheiro: {a.artilheiro.name} ({clubs[a.artilheiro.clubId]?.shortName}) · {a.artilheiro.value} gols
                </Muted>
              ) : null}
              {a.melhor ? (
                <Muted className="text-xs">
                  Melhor jogador: {a.melhor.name} ({clubs[a.melhor.clubId]?.shortName}) · nota {a.melhor.value.toFixed(1).replace('.', ',')}
                </Muted>
              ) : null}
              {a.revelacao ? (
                <Muted className="text-xs">
                  Revelação: {a.revelacao.name} ({clubs[a.revelacao.clubId]?.shortName}) · nota {a.revelacao.value.toFixed(1).replace('.', ',')}
                </Muted>
              ) : null}
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <Muted>Os prêmios da temporada saem quando ela termina.</Muted>
        </Card>
      )}

      <Card>
        <SectionTitle>Campeões</SectionTitle>
        {career.history
          .slice()
          .reverse()
          .slice(0, 10)
          .map((h) => (
            <View key={h.year} className="py-1">
              <Strong className="text-sm">{h.year}</Strong>
              {Object.entries(h.winners ?? {})
                .filter(([id]) => ['ucl', 'uel', 'uecl'].includes(id) || career.leagues[id]?.mode !== 'strength')
                .slice(0, 16)
                .map(([id, w]) => (
                  <Muted key={id} className="text-xs">
                    {compName(id)}: {clubs[w]?.name}
                  </Muted>
                ))}
            </View>
          ))}
      </Card>
    </ScrollView>
  );
}
