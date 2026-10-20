// Liga: tabela e rodadas na mesma aba.

import { useState } from 'react';
import { View } from 'react-native';
import { Segmented } from '../components/ui';
import { RoundsScreen } from './RoundsScreen';
import { TableScreen } from './TableScreen';

export function LeagueScreen() {
  const [sub, setSub] = useState<'tabela' | 'rodadas'>('tabela');
  return (
    <View className="flex-1">
      <View className="px-4 pt-2">
        <Segmented options={['tabela', 'rodadas'] as const} value={sub} onChange={setSub} labelOf={(v) => (v === 'tabela' ? 'Tabela' : 'Rodadas')} />
      </View>
      <View className="flex-1">{sub === 'tabela' ? <TableScreen /> : <RoundsScreen />}</View>
    </View>
  );
}
