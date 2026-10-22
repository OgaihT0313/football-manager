// Componentes básicos da identidade "Mesa de Comando" (tokens em components/theme.ts).
// Fontes: Big Shoulders Display (títulos, números grandes, botões primários), Archivo (texto),
// JetBrains Mono (rótulos, dinheiro, datas, estatísticas).

import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { crestUrl, photoUrl } from './images';
import { clubColor, useTokens } from './theme';

export function Card({ children, className = '', selected = false }: { children: ReactNode; className?: string; selected?: boolean }) {
  return (
    <View className={`rounded-[14px] bg-s1 p-4 ${selected ? 'border-[1.5px] border-acc' : 'border border-line'} ${className}`}>{children}</View>
  );
}

/** Rótulo de seção: mono, maiúsculo, espaçado. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`font-monom text-[10.5px] uppercase tracking-[1px] text-mute ${className}`}>{children}</Text>;
}

/** Compatibilidade: título de seção = rótulo com espaço embaixo. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <Label className="mb-2">{children}</Label>;
}

/** Título de tela (Big Shoulders, maiúsculo). */
export function Title({ children, className = '', size = 30 }: { children: ReactNode; className?: string; size?: number }) {
  return (
    <Text className={`font-disp uppercase text-ink ${className}`} style={{ fontSize: size, lineHeight: size * 1.05 }} numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Número grande (placar, saldo, OVR). */
export function Num({ children, className = '', size = 24, black = false }: { children: ReactNode; className?: string; size?: number; black?: boolean }) {
  return (
    <Text className={`${black ? 'font-disp9' : 'font-disp'} text-ink ${className}`} style={{ fontSize: size, lineHeight: size * 1.05 }}>
      {children}
    </Text>
  );
}

export function Mono({ children, className = '', bold = false }: { children: ReactNode; className?: string; bold?: boolean }) {
  return <Text className={`${bold ? 'font-monob' : 'font-mono'} text-xs text-ink ${className}`}>{children}</Text>;
}

export function Muted({ children, className = '', numberOfLines }: { children: ReactNode; className?: string; numberOfLines?: number }) {
  return (
    <Text className={`font-sans text-[13px] text-mute ${className}`} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Strong({ children, className = '', numberOfLines }: { children: ReactNode; className?: string; numberOfLines?: number }) {
  return (
    <Text className={`font-sansb text-[15px] text-ink ${className}`} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const BOX: Record<ButtonVariant, string> = {
  primary: 'bg-acc active:opacity-80',
  secondary: 'border border-line bg-transparent active:bg-s2',
  ghost: 'bg-transparent active:bg-s2',
  danger: 'border border-neg bg-transparent active:bg-s2',
  outline: 'border border-acc bg-transparent active:bg-s2',
};
const INK: Record<ButtonVariant, string> = {
  primary: 'text-onacc',
  secondary: 'text-ink',
  ghost: 'text-acct',
  danger: 'text-neg',
  outline: 'text-acct',
};
const HEIGHT: Record<ButtonSize, string> = { sm: 'min-h-[36px] rounded-[9px] px-3', md: 'min-h-[50px] rounded-xl px-4', lg: 'min-h-[56px] rounded-[14px] px-5' };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  right,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Conteúdo à direita (ex.: seta "→"); alinha o rótulo à esquerda. */
  right?: ReactNode;
}) {
  const t = useTokens();
  const primary = variant === 'primary';
  const fontSize = primary ? (size === 'lg' ? 22 : size === 'sm' ? 15 : 19) : size === 'sm' ? 12.5 : size === 'lg' ? 16 : 14.5;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center ${right ? 'justify-between' : 'justify-center'} ${HEIGHT[size]} ${BOX[variant]} ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={primary ? t.onacc : t.ink} />
      ) : (
        <Text
          className={`${primary ? 'font-disp uppercase tracking-[0.8px]' : variant === 'outline' || variant === 'ghost' ? 'font-sansb' : 'font-sanss'} ${INK[variant]}`}
          style={{ fontSize }}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
      {right && !loading ? right : null}
    </Pressable>
  );
}

/** Controle segmentado: trilho s2, opção ativa em s1. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labelOf = (o) => String(o),
  mono = false,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf?: (o: T) => string;
  mono?: boolean;
}) {
  return (
    <View className="flex-row rounded-[10px] bg-s2 p-[3px]">
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            className={`min-h-[34px] flex-1 items-center justify-center rounded-lg px-1 ${active ? 'bg-s1' : ''}`}
          >
            <Text className={`${mono ? 'font-monob' : 'font-sanss'} text-[12.5px] ${active ? 'text-ink' : 'text-mute'}`} numberOfLines={1}>
              {labelOf(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chips (pílulas). Ativo: fundo ink, texto bg. Rola na horizontal quando não cabem. */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  labelOf = (o) => String(o),
  className = '',
  mono = false,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf?: (o: T) => string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={`grow-0 ${className}`} contentContainerClassName="gap-1.5">
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            className={`min-h-[32px] justify-center rounded-full border px-3 ${active ? 'border-ink bg-ink' : 'border-line bg-transparent active:bg-s2'}`}
          >
            <Text className={`${mono ? 'font-monob' : 'font-sanss'} text-[12.5px] ${active ? 'text-bg' : 'text-mute'}`}>{labelOf(o)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Abas sublinhadas (Finanças / Staff / ...). */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  labelOf = (o) => o,
  className = '',
  size = 13,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf?: (o: T) => string;
  className?: string;
  size?: number;
}) {
  return (
    <View className={`flex-row gap-[18px] border-b border-line ${className}`}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            className={`min-h-[36px] justify-end border-b-2 pb-2 ${active ? 'border-acc' : 'border-transparent'}`}
          >
            <Text className={`font-sanss ${active ? 'text-ink' : 'text-mute'}`} style={{ fontSize: size }}>
              {labelOf(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'acc' }) {
  const tones = {
    neutral: 'bg-s2 text-ink',
    good: 'bg-pos/15 text-pos',
    warn: 'bg-acc/20 text-acct',
    bad: 'bg-neg/15 text-neg',
    acc: 'bg-acc text-onacc',
  };
  return <Text className={`overflow-hidden rounded-md px-1.5 py-0.5 font-monob text-[10.5px] ${tones[tone]}`}>{label}</Text>;
}

/** Selo de OVR: âmbar a partir de 80, s2 abaixo. */
export function OvrBadge({ ovr, w = 34, h = 26, size = 16 }: { ovr: number; w?: number; h?: number; size?: number }) {
  const hi = ovr >= 80;
  return (
    <View className={`items-center justify-center rounded-[7px] ${hi ? 'bg-acc' : 'bg-s2'}`} style={{ width: w, height: h }}>
      <Text className={`font-disp ${hi ? 'text-onacc' : 'text-ink'}`} style={{ fontSize: size, lineHeight: size * 1.1 }}>
        {Math.round(ovr)}
      </Text>
    </View>
  );
}

/** Cor da condição física: vermelho < 75, âmbar < 90, verde a partir de 90. */
export function condTone(v: number): 'bg-neg' | 'bg-acc' | 'bg-pos' {
  return v < 75 ? 'bg-neg' : v < 90 ? 'bg-acc' : 'bg-pos';
}

/** Barra de condição 0–100. */
export function CondBar({ value, width = 46, height = 3 }: { value: number; width?: number; height?: number }) {
  return (
    <View className="overflow-hidden rounded-sm bg-s2" style={{ width, height }}>
      <View className={`h-full rounded-sm ${condTone(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </View>
  );
}

/** Compatibilidade com as telas antigas. */
export function FitnessBar({ value }: { value: number }) {
  return <CondBar value={value} />;
}

/** Barra de progresso fina (diretoria, folha/teto). */
export function Meter({ pct, tone = 'acc', height = 4 }: { pct: number; tone?: 'acc' | 'pos' | 'neg'; height?: number }) {
  const bg = tone === 'pos' ? 'bg-pos' : tone === 'neg' ? 'bg-neg' : 'bg-acc';
  return (
    <View className="overflow-hidden rounded-sm bg-s2" style={{ height }}>
      <View className={`h-full rounded-sm ${bg}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </View>
  );
}

/** Escudo do clube (imagem do mundo real); sem imagem, círculo na cor do clube com a sigla. */
export function Crest({ id, short, size = 36 }: { id: string; short: string; size?: number }) {
  const url = crestUrl(id);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    // Disco claro atrás: escudos escuros (Tottenham, Juventus) somem no tema escuro.
    const pad = Math.max(2, Math.round(size * 0.12));
    return (
      <View className="items-center justify-center rounded-full" style={{ width: size, height: size, backgroundColor: 'rgba(255,255,255,0.92)' }}>
        <Image
          source={{ uri: url }}
          accessibilityLabel={`Escudo ${short}`}
          onError={() => setFailed(true)}
          resizeMode="contain"
          style={{ width: size - pad * 2, height: size - pad * 2 }}
        />
      </View>
    );
  }
  return (
    <View className="items-center justify-center rounded-full" style={{ width: size, height: size, backgroundColor: clubColor(id) }}>
      <Text className="font-disp text-white" style={{ fontSize: Math.max(9, size * 0.32), lineHeight: Math.max(10, size * 0.36) }} numberOfLines={1}>
        {short.slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

/** Quadrados de forma (V/E/D). */
export function Form({ list, size = 24, letters = true }: { list: ('V' | 'E' | 'D')[]; size?: number; letters?: boolean }) {
  return (
    <View className="flex-row gap-1">
      {list.map((r, i) => (
        <View
          key={i}
          className={`items-center justify-center rounded-md ${r === 'V' ? 'bg-pos' : r === 'D' ? 'bg-neg' : 'bg-s2'}`}
          style={{ width: size, height: size }}
        >
          {letters ? (
            <Text className={`font-disp ${r === 'E' ? 'text-ink' : 'text-[#0E1210]'}`} style={{ fontSize: size * 0.54 }}>
              {r}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Nota de 1 a 5 em pontos. */
export function Dots({ n, max = 5, size = 7 }: { n: number; max?: number; size?: number }) {
  return (
    <View className="flex-row gap-[3px]">
      {Array.from({ length: max }, (_, k) => (
        <View key={k} className={`rounded-full ${k < n ? 'bg-acc' : 'bg-s2'}`} style={{ width: size, height: size }} />
      ))}
    </View>
  );
}

/** Ponto colorido (caixa de entrada, legenda). */
export function Dot({ tone, size = 6 }: { tone: 'acc' | 'pos' | 'neg' | 'mute'; size?: number }) {
  const bg = tone === 'acc' ? 'bg-acc' : tone === 'pos' ? 'bg-pos' : tone === 'neg' ? 'bg-neg' : 'bg-mute';
  return <View className={`rounded-full ${bg}`} style={{ width: size, height: size }} />;
}

/** Foto do jogador (mundo real); sem foto, círculo com as iniciais. */
export function PlayerPhoto({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  const url = photoUrl(id);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <View className="overflow-hidden rounded-full bg-s2" style={{ width: size, height: size }}>
        <Image source={{ uri: url }} accessibilityLabel={name} onError={() => setFailed(true)} resizeMode="cover" style={{ width: size, height: size }} />
      </View>
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
  return (
    <View className="items-center justify-center rounded-full bg-s2" style={{ width: size, height: size }}>
      <Text className="font-disp text-mute" style={{ fontSize: size * 0.38 }}>
        {initials}
      </Text>
    </View>
  );
}
