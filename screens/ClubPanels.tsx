// Aba Clube › Staff (equipe técnica, mercado de staff e olheiro) e › Carreira (técnico,
// passagens, títulos, conquistas e prêmios da temporada).

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatWage } from '../components/labels';
import { useWide } from '../components/theme';
import { Badge, Button, Card, Chips, Crest, Dots, Label, Muted, Num, Strong } from '../components/ui';
import { myProspects } from '../src/career/managerCareer';
import { staffBudget, staffWeekly } from '../src/club/finance';
import { ACHIEVEMENTS } from '../src/manager/awards';
import { ROLE_EFFECT, ROLE_LABEL, SCOUT_REGIONS, STAFF_ROLES, type ScoutRegion } from '../src/manager/staff';
import { selectCareer, useGame } from '../store/gameStore';

const container = (wide: boolean) => (wide ? 'gap-5 px-12 py-8' : 'gap-3 px-3.5 pb-8 pt-3');

export function StaffView() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const hire = useGame((s) => s.hire);
  const scout = useGame((s) => s.scout);
  const setTab = useGame((s) => s.setTab);
  const [msg, setMsg] = useState<string | null>(null);
  const [region, setRegion] = useState<ScoutRegion>(SCOUT_REGIONS[0]);
  const club = career.clubs[career.userClubId]!;
  const prospects = myProspects(career);
  const wait = career.scoutReadySlot - career.season.nextSlot;

  const roles = STAFF_ROLES.map((role) => {
    const m = club.staff?.[role];
    const options = career.staffMarket.filter((s) => s.role === role).sort((a, b) => b.level - a.level);
    return (
      <Card key={role} className={`gap-2.5 ${wide ? 'w-[48.8%] rounded-2xl p-5' : ''}`}>
        <Label>{ROLE_LABEL[role]}</Label>
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Strong>{m?.name ?? 'Cargo vago'}</Strong>
            <Muted className="text-xs">{m ? formatWage(m.wage) : 'Sem ninguém: vale nível 1.'}</Muted>
          </View>
          <Dots n={m?.level ?? 0} size={9} />
        </View>
        <Muted className="text-xs">{ROLE_EFFECT[role]}</Muted>
        {options.length ? <Label className="mt-1 text-[10px]">Disponíveis nesta temporada</Label> : null}
        {options.map((o) => (
          <View key={o.id} className="flex-row items-center gap-3 border-t border-line pt-2">
            <View className="flex-1">
              <Text className="font-sanss text-[13.5px] text-ink">{o.name}</Text>
              <Text className="font-mono text-[11px] text-mute">{formatWage(o.wage)}</Text>
            </View>
            <Dots n={o.level} />
            <Button
              size="sm"
              variant="outline"
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
  });

  return (
    <ScrollView contentContainerClassName={container(wide)}>
      <View className="flex-row items-baseline justify-between px-1">
        <Label>Folha do staff</Label>
        <Text className="font-monob text-[12.5px] text-ink">
          {formatWage(staffWeekly(club))} <Text className="text-mute">de {formatWage(staffBudget(club))}</Text>
        </Text>
      </View>
      {msg ? (
        <Card className="border-acc">
          <Muted>{msg}</Muted>
        </Card>
      ) : null}
      <View className={wide ? 'flex-row flex-wrap gap-5' : 'gap-3'}>{roles}</View>

      <Card className={`gap-3 ${wide ? 'rounded-2xl p-6' : ''}`}>
        <Label>Missão do olheiro</Label>
        <Muted>Ele traz 3 jovens de 16 a 18 anos da região; quanto melhor o olheiro, maior o potencial. Eles aparecem em Mercado › Livres, só para você.</Muted>
        <Chips options={SCOUT_REGIONS} value={region} onChange={setRegion} />
        <Button
          label={wait > 0 ? `Olheiro em missão · volta em ${wait} data(s)` : `Enviar para ${region}`}
          disabled={wait > 0}
          onPress={() => {
            const r = scout(region);
            setMsg(r.ok ? null : r.message);
          }}
        />
        {prospects.length ? (
          <View>
            <Label className="pb-1.5">Prospectos à disposição</Label>
            {prospects.map((p) => (
              <View key={p.id} className="flex-row items-center gap-2 border-t border-line py-2">
                <Text className="flex-1 font-sanss text-[13.5px] text-ink" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text className="font-mono text-[11px] text-mute">
                  {p.age} anos · {p.nationality} · OVR {p.ovr} · POT ~{p.potential}
                </Text>
              </View>
            ))}
            <Button className="mt-1" variant="ghost" size="sm" label="Ver no mercado →" onPress={() => setTab('mercado')} />
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

export function CareerView() {
  const wide = useWide();
  const career = useGame(selectCareer)!;
  const { manager, clubs, season } = career;
  const [showAll, setShowAll] = useState(false);
  const last = career.awards[career.awards.length - 1];
  const totals = manager.spells.reduce((a, s) => ({ m: a.m + s.matches, w: a.w + s.wins, d: a.d + s.draws, l: a.l + s.losses }), { m: 0, w: 0, d: 0, l: 0 });
  const compName = (id: string) => season.competitions[id]?.name ?? career.leagues[id]?.name ?? id;
  const history = career.history.slice().reverse();

  const header = (
    <Card className={`gap-2 ${wide ? 'rounded-2xl p-6' : ''}`}>
      <Label>Técnico{career.era ? ` · era ${career.era.name}` : ''}</Label>
      <Num size={wide ? 44 : 32} black className="uppercase">
        {manager.name}
      </Num>
      <View className="flex-row gap-6">
        {[
          ['Reputação', `${manager.reputation}`],
          ['Jogos', `${totals.m}`],
          ['V-E-D', `${totals.w}-${totals.d}-${totals.l}`],
          ['Conquistas', `${manager.achievements.length}/${ACHIEVEMENTS.length}`],
        ].map(([k, v]) => (
          <View key={k}>
            <Label className="text-[10px]">{k}</Label>
            <Num size={22}>{v}</Num>
          </View>
        ))}
      </View>
    </Card>
  );

  const spells = (
    <Card className={wide ? 'rounded-2xl p-6' : ''}>
      <Label className="pb-1.5">Passagens</Label>
      {manager.spells
        .slice()
        .reverse()
        .map((s, i) => (
          <View key={i} className="flex-row items-center gap-3 border-t border-line py-2.5">
            <Crest id={s.clubId} short={clubs[s.clubId]?.shortName ?? '?'} size={32} />
            <View className="flex-1">
              <Text className="font-sansb text-sm text-ink" numberOfLines={1}>
                {clubs[s.clubId]?.name}
              </Text>
              <Text className="font-mono text-[11px] text-mute">
                {s.fromYear}–{s.toYear ?? 'hoje'} · {s.matches} J · {s.wins}V {s.draws}E {s.losses}D
              </Text>
              {s.titles.length ? <Text className="font-sans text-xs text-acct">🏆 {s.titles.join(', ')}</Text> : null}
            </View>
            {s.end === 'demitido' ? <Badge tone="bad" label="Demitido" /> : s.end === 'saiu' ? <Badge label="Saiu" /> : <Badge tone="good" label="Atual" />}
          </View>
        ))}
    </Card>
  );

  const achievements = (
    <Card className={wide ? 'rounded-2xl p-6' : ''}>
      <Label className="pb-1.5">
        Conquistas · {manager.achievements.length}/{ACHIEVEMENTS.length}
      </Label>
      {ACHIEVEMENTS.map((a) => {
        const got = manager.achievements.includes(a.id);
        return (
          <View key={a.id} className={`flex-row items-center gap-3 border-t border-line py-2 ${got ? '' : 'opacity-40'}`}>
            <View className={`h-5 w-5 items-center justify-center rounded-[5px] ${got ? 'bg-acc' : 'bg-s2'}`}>
              <Text className={`font-disp text-[11px] ${got ? 'text-onacc' : 'text-mute'}`}>{got ? '✓' : ''}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-sanss text-[13.5px] text-ink">{a.label}</Text>
              <Muted className="text-xs">{a.description}</Muted>
            </View>
          </View>
        );
      })}
    </Card>
  );

  const awards = last ? (
    <Card className={wide ? 'rounded-2xl p-6' : ''}>
      <Label className="pb-1.5">Prêmios {last.year}</Label>
      {last.list.map((a) => (
        <View key={a.competitionId} className="gap-0.5 border-t border-line py-2">
          <Text className="font-sansb text-[13px] text-ink">{compName(a.competitionId)}</Text>
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
  );

  const champions = (
    <Card className={wide ? 'rounded-2xl p-6' : ''}>
      <Label className="pb-1.5">Temporadas e campeões</Label>
      {history.length === 0 ? <Muted>Nenhuma temporada encerrada ainda.</Muted> : null}
      {(showAll ? history : history.slice(0, 5)).map((h) => (
        <View key={h.year} className="gap-0.5 border-t border-line py-2">
          <Text className="font-disp text-lg text-ink">
            {h.year} <Text className="font-sans text-xs text-mute">· você {h.userPosition}º na {career.leagues[h.leagueId]?.name ?? 'liga'} ({h.userPoints} pts)</Text>
          </Text>
          {Object.entries(h.winners ?? {})
            .filter(([id]) => ['ucl', 'uel', 'uecl'].includes(id) || career.leagues[id]?.mode !== 'strength')
            .slice(0, 16)
            .map(([id, w]) => (
              <Muted key={id} className="text-xs">
                {compName(id)}: <Text className={w === career.userClubId ? 'font-sansb text-acct' : 'text-ink'}>{clubs[w]?.name}</Text>
              </Muted>
            ))}
        </View>
      ))}
      {history.length > 5 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(!showAll)} className="pt-2">
          <Text className="font-sansb text-[13px] text-acct">{showAll ? 'Mostrar menos' : `Ver as ${history.length} temporadas`}</Text>
        </Pressable>
      ) : null}
    </Card>
  );

  if (wide) {
    return (
      <ScrollView contentContainerClassName={container(true)}>
        {header}
        <View className="flex-row gap-5">
          <View className="flex-1 gap-5">
            {spells}
            {champions}
          </View>
          <View className="flex-1 gap-5">
            {awards}
            {achievements}
          </View>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerClassName={container(false)}>
      {header}
      {spells}
      {awards}
      {achievements}
      {champions}
    </ScrollView>
  );
}
