// Cabeçalho de tela: título em Big Shoulders e uma informação em mono à direita (ou uma ação).

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useWide } from './theme';
import { Title } from './ui';

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const wide = useWide();
  return (
    <View className={`flex-row items-center gap-3 ${wide ? 'pb-4 pt-1' : 'px-[18px] pb-2.5 pt-2'}`}>
      <View className="flex-1 flex-row items-baseline gap-4">
        <Title size={wide ? 40 : 30}>{title}</Title>
        {subtitle ? (
          <Text className="ml-auto shrink font-mono text-[11px] uppercase text-mute" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
