// Componentes básicos de interface, com tema claro/escuro via classes `dark:`.

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<ButtonVariant, { box: string; text: string }> = {
  primary: { box: 'bg-green-600 active:bg-green-700', text: 'text-white' },
  secondary: { box: 'bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:active:bg-slate-700', text: 'text-slate-900 dark:text-slate-100' },
  danger: { box: 'bg-red-600 active:bg-red-700', text: 'text-white' },
  ghost: { box: 'bg-transparent active:bg-slate-200 dark:active:bg-slate-800', text: 'text-green-700 dark:text-green-400' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      className={`min-h-[48px] flex-row items-center justify-center rounded-xl px-4 ${v.box} ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text className={`text-base font-semibold ${v.text}`}>{label}</Text>}
    </Pressable>
  );
}

/** Seletor de opções lado a lado (formação, níveis de tática, tema). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labelOf = (o) => String(o),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf?: (o: T) => string;
}) {
  return (
    <View className="flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            className={`min-h-[36px] flex-1 items-center justify-center rounded-lg px-1 ${active ? 'bg-white shadow-sm dark:bg-slate-600' : ''}`}
          >
            <Text className={`text-sm ${active ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
              {labelOf(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    good: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    bad: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return <Text className={`overflow-hidden rounded-md px-1.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{label}</Text>;
}

/** Barra de condição física 0-100. */
export function FitnessBar({ value }: { value: number }) {
  const color = value >= 85 ? 'bg-green-500' : value >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <View className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <View className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </View>
  );
}

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>{children}</Text>;
}

export function Strong({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-base font-semibold text-slate-900 dark:text-slate-100 ${className}`}>{children}</Text>;
}
