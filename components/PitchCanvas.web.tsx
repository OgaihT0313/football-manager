// Campo 2D no navegador: o Skia precisa do CanvasKit (WebAssembly), servido de `public/`
// (`npm run setup:skia`, roda sozinho no postinstall). O componente só é importado depois disso.

import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { Text } from 'react-native';
import type { PitchProps } from './Pitch2D';

export function PitchCanvas(props: PitchProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./Pitch2D')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={<Text className="p-4 text-center text-slate-500">Carregando o campo…</Text>}
    />
  );
}
