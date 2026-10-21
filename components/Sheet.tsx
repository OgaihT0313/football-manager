// Painel que sobe do rodapé (no PC, uma janela no centro), com fundo escurecido. Toque fora fecha.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWide } from './theme';
import { Button } from './ui';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <View className={`absolute inset-0 bg-black/60 ${wide ? 'items-center justify-center' : ''}`}>
      <Pressable accessibilityLabel="Fechar" className={wide ? 'absolute inset-0' : 'flex-1'} onPress={onClose} />
      <View
        className={`border border-line bg-s1 ${wide ? 'max-h-[85%] w-[520px] rounded-[20px]' : 'max-h-[85%] rounded-t-[22px]'}`}
        style={{ paddingBottom: wide ? 8 : insets.bottom }}
      >
        <View className="flex-row items-center justify-between px-[18px] pb-2 pt-4">
          <Text className="flex-1 font-disp text-[24px] uppercase text-ink" numberOfLines={1}>
            {title}
          </Text>
          <Button variant="ghost" size="sm" label="Fechar" onPress={onClose} />
        </View>
        <ScrollView contentContainerClassName="gap-3 px-[18px] pb-6">{children}</ScrollView>
      </View>
    </View>
  );
}
