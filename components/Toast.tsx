// Aviso curto no rodapé com o resultado da última ação; some sozinho.

import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { useGame } from '../store/gameStore';

export function Toast() {
  const toast = useGame((s) => s.toast);
  const clear = useGame((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clear, 3500);
    return () => clearTimeout(t);
  }, [toast, clear]);
  if (!toast) return null;
  return (
    <Pressable
      accessibilityRole="alert"
      onPress={clear}
      className="mx-4 mb-2 rounded-xl bg-slate-900 px-4 py-3 dark:bg-slate-100"
    >
      <Text className="text-sm font-semibold text-white dark:text-slate-900">{toast}</Text>
    </Pressable>
  );
}
