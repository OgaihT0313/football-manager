// Campo 2D no celular: o Skia nativo já está carregado.

import Pitch2D, { type PitchProps } from './Pitch2D';

export function PitchCanvas(props: PitchProps) {
  return <Pitch2D {...props} />;
}
