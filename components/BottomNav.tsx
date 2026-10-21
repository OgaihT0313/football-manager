// Barra de abas inferior (layout de celular): barrinha âmbar em cima da aba ativa.

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame, type Tab } from '../store/gameStore';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'elenco', label: 'Elenco' },
  { id: 'escalacao', label: 'Escalação' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'clube', label: 'Clube' },
  { id: 'liga', label: 'Liga' },
];

export function BottomNav() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-row border-t border-line bg-s1" style={{ paddingBottom: Math.max(insets.bottom, 8) }} accessibilityRole="tablist">
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => setTab(t.id)}
            className="h-[58px] flex-1 items-center justify-center gap-1.5"
          >
            <View className={`h-[3px] w-[22px] rounded-sm ${active ? 'bg-acc' : 'bg-transparent'}`} />
            <Text numberOfLines={1} className={`text-[11px] ${active ? 'font-sansb text-ink' : 'font-sansm text-mute'}`}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
