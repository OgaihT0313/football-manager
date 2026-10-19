// Cabeçalho das telas do jogo: título, subtítulo e ação opcional à direita.

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
      <View className="flex-1">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
