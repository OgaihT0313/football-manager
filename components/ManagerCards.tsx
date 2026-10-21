// Cartões da camada de técnico no Início: diretoria, decisões pendentes, propostas de emprego,
// notícias e a tela de técnico desempregado.

import { ScrollView, Text, View } from 'react-native';
import { jobsFor } from '../src/career/managerCareer';
import { confidenceZone, MANDATE_META, ZONE_LABEL } from '../src/manager/board';
import type { CareerState } from '../src/career/career';
import { useGame } from '../store/gameStore';
import { Header } from './Header';
import { Badge, Button, Card, Muted, SectionTitle, Strong } from './ui';

export function BoardCard({ career }: { career: CareerState }) {
  const b = career.board;
  const zone = confidenceZone(b.confidence);
  const color = zone === 'estavel' ? 'bg-green-600' : zone === 'pressionado' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <Card>
      <SectionTitle>Diretoria</SectionTitle>
      <View className="flex-row items-center justify-between">
        <Strong>{MANDATE_META[b.mandate].label}</Strong>
        <Badge tone={zone === 'estavel' ? 'good' : zone === 'pressionado' ? 'warn' : 'bad'} label={ZONE_LABEL[zone]} />
      </View>
      <Muted className="mt-1">{b.note}</Muted>
      <Muted className="mt-1">Meta: terminar até o {b.targetPosition}º lugar.</Muted>
      <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <View className={`h-full ${color}`} style={{ width: `${b.confidence}%` }} />
      </View>
      <Muted className="mt-1 text-xs">Confiança {b.confidence}/100</Muted>
    </Card>
  );
}

export function DecisionsCard({ career }: { career: CareerState }) {
  const decide = useGame((s) => s.decide);
  if (!career.decisions.length) return null;
  return (
    <Card className="border-amber-300 dark:border-amber-700">
      <SectionTitle>Decisões pendentes</SectionTitle>
      {career.decisions.map((d) => (
        <View key={d.id} className="mb-3">
          <Strong>{d.title}</Strong>
          <Text className="mt-1 text-sm text-slate-700 dark:text-slate-300">{d.text}</Text>
          <View className="mt-2 gap-2">
            {d.options.map((o, i) => (
              <Button key={i} variant="secondary" label={o.label} onPress={() => decide(d.id, i)} />
            ))}
          </View>
          <Muted className="mt-1 text-xs">Sem resposta até o jogo, vale “{d.options[d.defaultOption]!.label}”.</Muted>
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
    <Card>
      <SectionTitle>{career.manager.employed ? 'Clubes interessados em você' : 'Vagas abertas'}</SectionTitle>
      {jobs.map((v) => {
        const club = career.clubs[v.clubId]!;
        return (
          <View key={v.clubId} className="flex-row items-center justify-between py-1.5">
            <View className="flex-1">
              <Text className="text-slate-900 dark:text-slate-100" numberOfLines={1}>
                {club.name}
              </Text>
              <Muted className="text-xs">
                {career.leagues[club.leagueId]?.name} · reputação {club.reputation}
              </Muted>
            </View>
            <Button variant="secondary" label="Assumir" onPress={() => takeJob(v.clubId)} />
          </View>
        );
      })}
      {career.manager.employed ? <Muted className="mt-1 text-xs">Aceitar significa deixar o clube atual agora.</Muted> : null}
    </Card>
  );
}

export function NewsCard({ career, count = 6 }: { career: CareerState; count?: number }) {
  const items = career.news.slice(-count).reverse();
  if (!items.length) return null;
  return (
    <Card>
      <SectionTitle>Notícias</SectionTitle>
      {items.map((n, i) => (
        <Muted key={i} className="py-0.5">
          {n.year} · {n.text}
        </Muted>
      ))}
    </Card>
  );
}

/** Início quando o técnico está sem clube: reputação, vagas e avançar o calendário. */
export function UnemployedView({ career }: { career: CareerState }) {
  const busy = useGame((s) => s.busy);
  const advanceOne = useGame((s) => s.advanceOne);
  const nextSeason = useGame((s) => s.nextSeason);
  const backToMenu = useGame((s) => s.backToMenu);
  const over = career.season.nextSlot >= career.season.slots.length;
  const m = career.manager;
  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
      <Header title={m.name} subtitle={`Sem clube · temporada ${career.season.year}`} right={<Button variant="ghost" label="Menu" onPress={backToMenu} />} />
      <Card>
        <SectionTitle>Você está desempregado</SectionTitle>
        <Muted>
          Reputação {m.reputation}. Enquanto você espera, o calendário segue; quanto mais tempo parado, mais clubes aceitam conversar.
        </Muted>
        <View className="mt-3 flex-row gap-2">
          {over ? (
            <Button className="flex-1" label={`Avançar para ${career.season.year + 1}`} loading={busy} onPress={nextSeason} />
          ) : (
            <Button className="flex-1" label="Avançar uma data" loading={busy} onPress={advanceOne} />
          )}
        </View>
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
