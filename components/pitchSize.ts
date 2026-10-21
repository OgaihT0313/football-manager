// Medidas do campo 2D, separadas do desenho: no web, importar qualquer coisa de Pitch2D.tsx
// (que importa o Skia) antes de o CanvasKit carregar quebra o Skia.

/** Proporção do campo (105 x 68). */
export const PITCH_RATIO = 105 / 68;

export function pitchHeight(width: number, horizontal: boolean): number {
  return Math.round(horizontal ? width / PITCH_RATIO : width * PITCH_RATIO);
}
