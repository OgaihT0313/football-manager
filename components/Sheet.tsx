// Painel que sobe do rodapé, com fundo escurecido. Toque fora fecha.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Strong } from './ui';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="absolute inset-0 bg-black/50">
      <Pressable accessibilityLabel="Fechar" className="flex-1" onPress={onClose} />
      <View className="max-h-[85%] rounded-t-3xl bg-white dark:bg-slate-900" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Strong className="flex-1">{title}</Strong>
          <Button variant="ghost" label="Fechar" onPress={onClose} />
        </View>
        <ScrollView contentContainerClassName="gap-3 px-4 pb-6">{children}</ScrollView>
      </View>
    </View>
  );
}
