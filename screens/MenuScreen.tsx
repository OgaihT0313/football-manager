// Tela inicial: continuar a carreira salva, começar uma nova e escolher o tema.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { formatDate } from '../components/labels';
import { Button, Card, Muted, SectionTitle, Segmented, Strong } from '../components/ui';
import { useGame, type ThemePref } from '../store/gameStore';

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemePref, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };

export function MenuScreen() {
  const saveInfo = useGame((s) => s.saveInfo);
  const loadError = useGame((s) => s.loadError);
  const continueCareer = useGame((s) => s.continueCareer);
  const goToClubSelect = useGame((s) => s.goToClubSelect);
  const deleteSave = useGame((s) => s.deleteSave);
  const themePref = useGame((s) => s.themePref);
  const setThemePref = useGame((s) => s.setThemePref);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
      <View className="items-center py-8">
        <Text className="text-4xl font-black text-green-700 dark:text-green-400">Football Manager</Text>
        <Muted className="mt-1">Técnico e mercado</Muted>
      </View>

      {loadError ? (
        <Card className="border-red-300 dark:border-red-800">
          <Strong>Não foi possível abrir o save</Strong>
          <Muted className="mt-1">{loadError}</Muted>
          <Button className="mt-3" variant="danger" label="Apagar save" onPress={deleteSave} />
        </Card>
      ) : null}

      {saveInfo ? (
        <Card>
          <SectionTitle>Carreira salva</SectionTitle>
          <Strong>{saveInfo.clubName}</Strong>
          <Muted>
            Temporada {saveInfo.year} · rodada {saveInfo.round}/{saveInfo.totalRounds}
            {saveInfo.savedAt ? ` · salvo em ${formatDate(saveInfo.savedAt)}` : ''}
          </Muted>
          <Button className="mt-3" label="Continuar" onPress={continueCareer} />
          {confirmDelete ? (
            <View className="mt-3 gap-2">
              <Muted>Apagar a carreira salva? Não dá para desfazer.</Muted>
              <View className="flex-row gap-2">
                <Button className="flex-1" variant="secondary" label="Cancelar" onPress={() => setConfirmDelete(false)} />
                <Button className="flex-1" variant="danger" label="Apagar" onPress={() => { setConfirmDelete(false); deleteSave(); }} />
              </View>
            </View>
          ) : (
            <Button className="mt-2" variant="ghost" label="Apagar carreira" onPress={() => setConfirmDelete(true)} />
          )}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Nova carreira</SectionTitle>
        {saveInfo && confirmNew ? (
          <View className="gap-2">
            <Muted>Começar de novo substitui a carreira salva.</Muted>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="secondary" label="Cancelar" onPress={() => setConfirmNew(false)} />
              <Button className="flex-1" label="Substituir" onPress={goToClubSelect} />
            </View>
          </View>
        ) : (
          <Button
            variant={saveInfo ? 'secondary' : 'primary'}
            label="Novo jogo"
            onPress={() => (saveInfo ? setConfirmNew(true) : goToClubSelect())}
          />
        )}
      </Card>

      <Card>
        <SectionTitle>Tema</SectionTitle>
        <Segmented options={THEMES} value={themePref} onChange={setThemePref} labelOf={(t) => THEME_LABEL[t]} />
      </Card>
    </ScrollView>
  );
}
