// Menu inicial "Mesa de Comando": marca, carreira salva (continuar), nova carreira, tema e apagar.
// Celular: tudo numa coluna, com o card embaixo. PC: wordmark gigante à esquerda e painel à direita.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { formatDate } from '../components/labels';
import { useWide } from '../components/theme';
import { Button, Card, Crest, Label, Muted, Strong } from '../components/ui';
import { useGame, type ThemePref } from '../store/gameStore';

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' };
const THEME_LABEL: Record<ThemePref, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };

function Mark({ wide }: { wide: boolean }) {
  return (
    <View className="flex-row gap-1">
      <View className="bg-acc" style={{ width: wide ? 48 : 22, height: wide ? 10 : 6 }} />
      <View className="bg-acc opacity-50" style={{ width: wide ? 20 : 10, height: wide ? 10 : 6 }} />
    </View>
  );
}

function Wordmark({ wide }: { wide: boolean }) {
  const size = wide ? 200 : 64;
  return (
    <View>
      <Text className="font-disp9 uppercase text-ink" style={{ fontSize: size, lineHeight: size * 0.86, marginTop: wide ? 0 : 14 }}>
        {'Mesa de\nComando'}
      </Text>
      <Text className="mt-2 font-monom uppercase text-mute" style={{ fontSize: wide ? 14 : 11, letterSpacing: wide ? 2.2 : 1.5 }}>
        Football Manager · v0.7{wide ? ' · PC' : ''}
      </Text>
    </View>
  );
}

export function MenuScreen() {
  const wide = useWide();
  const saveInfo = useGame((s) => s.saveInfo);
  const loadError = useGame((s) => s.loadError);
  const continueCareer = useGame((s) => s.continueCareer);
  const goToClubSelect = useGame((s) => s.goToClubSelect);
  const deleteSave = useGame((s) => s.deleteSave);
  const themePref = useGame((s) => s.themePref);
  const setThemePref = useGame((s) => s.setThemePref);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const panel = (
    <View className={wide ? 'gap-4' : 'gap-5'}>
      {loadError ? (
        <Card className="border-neg">
          <Strong>Não foi possível abrir o save</Strong>
          <Muted className="mt-1">{loadError}</Muted>
          <Button className="mt-3" variant="danger" label="Apagar save" onPress={deleteSave} />
        </Card>
      ) : null}

      {saveInfo ? (
        wide ? (
          <View className="gap-4">
            <Label>Carreira salva</Label>
            <View className="flex-row items-center gap-4">
              <Crest id={saveInfo.clubId} short={saveInfo.shortName} size={64} />
              <View className="gap-1">
                <Text className="font-sansb text-[22px] text-ink">{saveInfo.employed ? saveInfo.clubName : 'Sem clube'}</Text>
                <Muted className="text-sm">{subtitleOf(saveInfo)}</Muted>
              </View>
            </View>
            <Button className="mt-2" size="lg" label="Continuar carreira" onPress={continueCareer} />
            <Text className="font-mono text-xs text-mute">{saveInfo.savedAt ? `Salvo em ${formatDate(saveInfo.savedAt)}` : ''}</Text>
            <View className="my-4 h-px bg-line" />
          </View>
        ) : (
          <Card className="gap-3.5 rounded-2xl">
            <Label>Carreira salva</Label>
            <View className="flex-row items-center gap-3">
              <Crest id={saveInfo.clubId} short={saveInfo.shortName} size={44} />
              <View className="flex-1 gap-0.5">
                <Text className="font-sansb text-base text-ink">{saveInfo.employed ? saveInfo.clubName : 'Sem clube'}</Text>
                <Muted className="text-[12.5px]">{subtitleOf(saveInfo)}</Muted>
              </View>
            </View>
            <Button label="Continuar" onPress={continueCareer} />
            <Text className="font-mono text-[11px] text-mute">{saveInfo.savedAt ? `Salvo em ${formatDate(saveInfo.savedAt)}` : ''}</Text>
          </Card>
        )
      ) : null}

      <View className="gap-2">
        {saveInfo && confirmNew ? (
          <Card className="gap-2 p-3">
            <Muted>Começar de novo substitui a carreira salva quando você assumir o novo clube.</Muted>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="secondary" label="Cancelar" onPress={() => setConfirmNew(false)} />
              <Button className="flex-1" variant="outline" label="Escolher clube" onPress={goToClubSelect} />
            </View>
          </Card>
        ) : (
          <Button
            variant={saveInfo ? 'secondary' : 'primary'}
            size={wide ? 'lg' : 'md'}
            label="Nova carreira"
            right={saveInfo ? <Text className="font-sans text-mute">→</Text> : undefined}
            onPress={() => (saveInfo ? setConfirmNew(true) : goToClubSelect())}
          />
        )}
        {confirmDelete ? (
          <Card className="gap-2 p-3">
            <Muted>Apagar a carreira salva? Não dá para desfazer.</Muted>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="secondary" label="Cancelar" onPress={() => setConfirmDelete(false)} />
              <Button
                className="flex-1"
                variant="danger"
                label="Apagar"
                onPress={() => {
                  setConfirmDelete(false);
                  deleteSave();
                }}
              />
            </View>
          </Card>
        ) : null}
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            label={saveInfo ? 'Apagar carreira' : 'Sobre'}
            disabled={!saveInfo}
            onPress={() => setConfirmDelete(true)}
          />
          <Button className="flex-1" variant="secondary" label={`Tema: ${THEME_LABEL[themePref]}`} onPress={() => setThemePref(NEXT_THEME[themePref])} />
        </View>
      </View>
    </View>
  );

  if (wide) {
    return (
      <View className="flex-1 flex-row">
        <View className="flex-1 justify-between border-r border-line p-20">
          <Mark wide />
          <Wordmark wide />
        </View>
        <ScrollView className="w-[480px] grow-0 bg-s1" contentContainerClassName="flex-grow justify-end px-14 py-20">
          {panel}
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView contentContainerClassName="flex-grow gap-5 px-[22px] pb-6 pt-7">
      <View className="gap-1">
        <Mark wide={false} />
        <Wordmark wide={false} />
      </View>
      <View className="flex-1" />
      {panel}
    </ScrollView>
  );
}

function subtitleOf(s: { leagueName: string; position: number; year: number; employed: boolean }): string {
  const parts = [s.employed ? s.leagueName : 'Técnico desempregado'];
  if (s.employed && s.position) parts.push(`${s.position}º lugar`);
  parts.push(`Temp. ${s.year}`);
  return parts.filter(Boolean).join(' · ');
}
