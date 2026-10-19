// Barra de abas inferior.

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame, type Tab } from '../store/gameStore';

const TABS: { id: Tab; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'elenco', label: 'Elenco' },
  { id: 'escalacao', label: 'Escalação' },
  { id: 'tabela', label: 'Tabela' },
  { id: 'rodadas', label: 'Rodadas' },
];

export function BottomNav() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      style={{ paddingBottom: insets.bottom }}
      accessibilityRole="tablist"
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => setTab(t.id)}
            className="min-h-[56px] flex-1 items-center justify-center"
          >
            <View className={`mb-1 h-1 w-6 rounded-full ${active ? 'bg-green-600' : 'bg-transparent'}`} />
            <Text className={`text-xs ${active ? 'font-bold text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
