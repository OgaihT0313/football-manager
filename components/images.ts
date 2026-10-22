// Escudos e fotos do mundo real (data/world/images.json, gerado por scripts/fetch_images.ts).
// Buscados pela internet na hora de desenhar; quem não tem imagem usa sigla ou iniciais.

import imagesJson from '../data/world/images.json';

interface ImageMap {
  base?: string;
  clubs?: Record<string, string>;
  players?: Record<string, string>;
}

const map = imagesJson as ImageMap;
const base = map.base ?? '';

export function crestUrl(clubId: string): string | null {
  const path = map.clubs?.[clubId];
  return path ? base + path : null;
}

export function photoUrl(playerId: string): string | null {
  const path = map.players?.[playerId];
  return path ? base + path : null;
}
