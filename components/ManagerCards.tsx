// Cartões da camada de técnico: diretoria (completa e resumida), decisões pendentes, propostas de
// emprego, notícias e a tela de técnico desempregado.

import { ScrollView, Text, View } from 'react-native';
import { jobsFor } from '../src/career/managerCareer';
import { confidenceZone, MANDATE_META, ZONE_LABEL } from '../src/manager/board';
import type { CareerState } from '../src/career/career';
import { useGame } from '../store/gameStore';
import { Header } from './Header';
import { useWide } from './theme';
import { Badge, Button, Card, Crest, Dot, Label, Meter, Muted, Num, Strong } from './ui';

const zoneTone = (z: ReturnType<typeof confidenceZone>) => (z === 'estavel' ? 'pos' : z === 'pressionado' ? 'acc' : 'neg') as 'pos' | 'acc' | 'neg';

/** Diretoria completa (aba Clube › Diretoria). */
export function BoardCard({ career }: { career: CareerState }) {
  const b = career.board;
  const zone = confidenceZone(b.confidence);
  const tone = zoneTone(zone);
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Label>Diretoria · mandato</Label>
        <Badge tone={tone === 'pos' ? 'good' : tone === 'acc' ? 'warn' : 'bad'} label={ZONE_LABEL[zone]} />
      </View>
      <Num size={28} className="uppercase">
        {MANDATE_META[b.mandate].label}
      </Num>
      <Muted>{b.note}</Muted>
      <Muted>Meta: terminar até o {b.targetPosition}º lugar.</Muted>
      <View className="gap-1.5">
        <View className="flex-row items-baseline justify-between">
          <Label>Confiança</Label>
          <Num size={22}>
            {b.confidence}
            <Text className="font-disp text-sm text-mute">/100</Text>
          </Num>
        </View>
        <Meter pct={b.confidence} tone={tone} />
      </View>
    </Card>
  );
}

/** Diretoria resumida (Início): nota e barra. */
export function BoardMini({ career, wide = false }: { career: CareerState; wide?: boolean }) {
  const b = career.board;
  const tone = zoneTone(confidenceZone(b.confidence));
  return (
    <Card className={`flex-1 gap-1 ${wide ? 'rounded-2xl p-[18px]' : 'p-3'}`}>
      <Label>Diretoria</Label>
      <Num size={wide ? 30 : 24}>
        {b.confidence}
        <Text className="font-disp text-mute" style={{ fontSize: wide ? 16 : 14 }}>
          /100
        </Text>
      </Num>
      <Meter pct={b.confidence} tone={tone} />
      <Muted className="mt-1 text-[11px]" numberOfLines={1}>
        {MANDATE_META[b.mandate].label} · até o {b.targetPosition}º
      </Muted>
    </Card>
  );
}

export function DecisionsCard({ career }: { career: CareerState }) {
  const decide = useGame((s) => s.decide);
  if (!career.decisions.length) return null;
  return (
    <Card selected className="gap-3">
      <Label>Decisões pendentes · {career.decisions.length}</Label>
      {career.decisions.map((d) => (
        <View key={d.id} className="gap-2">
          <Strong>{d.title}</Strong>
          <Text className="font-sans text-sm leading-5 text-ink">{d.text}</Text>
          <View className="gap-2">
            {d.options.map((o, i) => (
              <Button key={i} variant="secondary" label={o.label} onPress={() => decide(d.id, i)} />
            ))}
          </View>
          <Text className="font-mono text-[11px] text-mute">Sem resposta até o jogo, vale “{d.options[d.defaultOption]!.label}”.</Text>
        </View>
      ))}
    </Card>
  );
}

export function JobOffersCard({ career }: { career: CareerState }) {
  const takeJob = useGame((s) => s.takeJob);
  const jobs = jobsFor(career);
  if (!jobs.length) return null;
  return (
    <Card className="gap-1">
      <Label className="pb-1">{career.manager.employed ? 'Clubes interessados em você' : 'Vagas abertas'}</Label>
      {jobs.map((v) => {
        const club = career.clubs[v.clubId]!;
        return (
          <View key={v.clubId} className="flex-row items-center gap-3 border-t border-line py-2.5">
            <Crest id={club.id} short={club.shortName} size={34} />
            <View className="flex-1">
              <Text className="font-sansb text-sm text-ink" numberOfLines={1}>
                {club.name}
              </Text>
              <Text className="font-mono text-[11px] text-mute">
                {career.leagues[club.leagueId]?.name} · REP {club.reputation}
              </Text>
            </View>
            <Button size="sm" variant="outline" label="Assumir" onPress={() => takeJob(v.clubId)} />
          </View>
        );
      })}
      {career.manager.employed ? <Muted className="mt-1 text-xs">Aceitar significa deixar o clube atual agora.</Muted> : null}
    </Card>
  );
}

const NEWS_TONE: Record<string, 'acc' | 'pos' | 'neg' | 'mute'> = {
  titulo: 'pos', premio: 'pos', diretoria: 'acc', emprego: 'acc', decisao: 'acc', staff: 'mute', olheiro: 'mute',
};

export function NewsCard({ career, count = 6 }: { career: CareerState; count?: number }) {
  const items = career.news.slice(-count).reverse();
  if (!items.length) return null;
  return (
    <View>
      <Label className="px-0.5 pb-1.5 pt-1">Notícias</Label>
      {items.map((n, i) => (
        <View key={i} className="flex-row gap-3 border-t border-line px-1 py-2.5">
          <View className="mt-[7px]">
            <Dot tone={NEWS_TONE[n.kind] ?? 'mute'} />
          </View>
          <Text className="flex-1 font-sans text-[13px] text-ink">
            <Text className="font-mono text-[11px] text-mute">{n.year} · </Text>
            {n.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Início quando o técnico está sem clube: reputação, vagas e avançar o calendário. */
export function UnemployedView({ career }: { career: CareerState }) {
  const wide = useWide();
  const busy = useGame((s) => s.busy);
  const advanceOne = useGame((s) => s.advanceOne);
  const nextSeason = useGame((s) => s.nextSeason);
  const backToMenu = useGame((s) => s.backToMenu);
  const over = career.season.nextSlot >= career.season.slots.length;
  const m = career.manager;
  return (
    <ScrollView contentContainerClassName={`gap-4 ${wide ? 'mx-auto w-full max-w-[880px] px-12 py-9' : 'px-3.5 pb-8'}`}>
      <Header title={m.name} subtitle={`Sem clube · ${career.season.year}`} right={wide ? undefined : <Button variant="ghost" size="sm" label="Menu" onPress={backToMenu} />} />
      <Card className="gap-3">
        <Label>Você está desempregado</Label>
        <Num size={40}>
          {m.reputation}
          <Text className="font-disp text-base text-mute"> de reputação</Text>
        </Num>
        <Muted>Enquanto você espera, o calendário segue; quanto mais tempo parado, mais clubes aceitam conversar.</Muted>
        {over ? (
          <Button label={`Avançar para ${career.season.year + 1}`} loading={busy} onPress={nextSeason} />
        ) : (
          <Button label="Avançar uma data" loading={busy} onPress={advanceOne} />
        )}
      </Card>
      <JobOffersCard career={career} />
      {!jobsFor(career).length ? (
        <Card>
          <Muted>Nenhuma vaga ao seu alcance por enquanto. Clubes trocam de técnico quando vão mal na liga.</Muted>
        </Card>
      ) : null}
      <NewsCard career={career} count={10} />
    </ScrollView>
  );
}
