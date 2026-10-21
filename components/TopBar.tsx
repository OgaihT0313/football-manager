// Cabeçalho do layout de PC: escudo e clube, abas com sublinhado âmbar, data e "Próximo jogo".

import { Pressable, Text, View } from 'react-native';
import { isWorldSeasonOver } from '../src/competitions/world';
import { selectCareer, useGame } from '../store/gameStore';
import { TABS } from './BottomNav';
import { slotDate } from './labels';
import { Button, Crest } from './ui';

export function TopBar() {
  const career = useGame(selectCareer);
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const busy = useGame((s) => s.busy);
  const playNextRound = useGame((s) => s.playNextRound);
  const backToMenu = useGame((s) => s.backToMenu);
  if (!career) return null;
  const club = career.clubs[career.userClubId];
  const employed = career.manager.employed;
  const s = career.season;
  const over = isWorldSeasonOver(s);
  return (
    <View className="h-[68px] flex-row items-center gap-10 border-b border-line bg-s1 px-10">
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao menu" onPress={backToMenu} className="flex-row items-center gap-2.5">
        {club && employed ? <Crest id={club.id} short={club.shortName} size={30} /> : null}
        <Text className="font-sansb text-[15px] text-ink" numberOfLines={1}>
          {employed ? club?.name : career.manager.name}
        </Text>
      </Pressable>
      <View className="h-full flex-row gap-7" accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(t.id)}
              className={`h-full justify-center border-b-[3px] ${active ? 'border-acc' : 'border-transparent'}`}
            >
              <Text className={`text-[14.5px] ${active ? 'font-sansb text-ink' : 'font-sansm text-mute'}`}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View className="ml-auto flex-row items-center gap-5">
        <Text className="font-monom text-xs text-mute">{slotDate(s.year, s.slots[s.nextSlot])}</Text>
        {employed && !over ? <Button size="sm" label="Próximo jogo ▸" loading={busy} onPress={playNextRound} className="h-[38px]" /> : null}
      </View>
    </View>
  );
}
