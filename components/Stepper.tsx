// Campo numérico com botões − e + (valores de dinheiro), sem teclado.

import { Pressable, Text, View } from 'react-native';
import { Label } from './ui';

export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  format: (v: number) => string;
}) {
  const btn = 'h-11 w-11 items-center justify-center rounded-xl border border-line active:bg-s2';
  return (
    <View>
      <Label className="mb-1.5">{label}</Label>
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${label}`} className={btn} onPress={() => onChange(Math.max(min, value - step))}>
          <Text className="font-sansb text-xl text-ink">−</Text>
        </Pressable>
        <Text className="flex-1 text-center font-monob text-[17px] text-ink">{format(value)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} className={btn} onPress={() => onChange(value + step)}>
          <Text className="font-sansb text-xl text-ink">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
