// Campo numérico com botões − e + (valores de dinheiro), sem teclado.

import { Pressable, Text, View } from 'react-native';
import { Muted } from './ui';

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
  const btn = 'h-11 w-11 items-center justify-center rounded-xl bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:active:bg-slate-700';
  return (
    <View>
      <Muted className="mb-1">{label}</Muted>
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${label}`} className={btn} onPress={() => onChange(Math.max(min, value - step))}>
          <Text className="text-xl font-bold text-slate-900 dark:text-white">−</Text>
        </Pressable>
        <Text className="flex-1 text-center text-lg font-bold text-slate-900 dark:text-white">{format(value)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} className={btn} onPress={() => onChange(value + step)}>
          <Text className="text-xl font-bold text-slate-900 dark:text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
