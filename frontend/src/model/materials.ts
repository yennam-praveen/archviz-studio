// Procedural PBR presets (no texture files, so nothing to license and nothing to load).
// Phase 3 can layer CC0 texture maps (ambientCG / Poly Haven) on top of the same keys.

export interface MaterialPreset {
  label: string;
  color: string;
  roughness: number;
  metalness: number;
  category: 'wall' | 'floor' | 'roof';
}

export const MATERIALS: Record<string, MaterialPreset> = {
  plaster: { label: 'White plaster', color: '#ece8df', roughness: 0.9, metalness: 0, category: 'wall' },
  plaster_warm: { label: 'Warm plaster', color: '#e4d3b8', roughness: 0.9, metalness: 0, category: 'wall' },
  brick: { label: 'Red brick', color: '#9a4e3a', roughness: 0.95, metalness: 0, category: 'wall' },
  concrete: { label: 'Concrete', color: '#9d9a93', roughness: 0.85, metalness: 0, category: 'wall' },
  stone: { label: 'Basalt stone', color: '#5b5a57', roughness: 0.9, metalness: 0, category: 'wall' },
  timber: { label: 'Timber cladding', color: '#8b5a2b', roughness: 0.7, metalness: 0, category: 'wall' },
  charcoal: { label: 'Charcoal render', color: '#3a3d42', roughness: 0.8, metalness: 0, category: 'wall' },

  concrete_floor: { label: 'Polished concrete', color: '#b0aca4', roughness: 0.4, metalness: 0, category: 'floor' },
  oak: { label: 'Oak parquet', color: '#b8874a', roughness: 0.5, metalness: 0, category: 'floor' },
  tile_white: { label: 'White tile', color: '#e9e9e6', roughness: 0.25, metalness: 0, category: 'floor' },
  tile_terracotta: { label: 'Terracotta tile', color: '#b45f3b', roughness: 0.6, metalness: 0, category: 'floor' },
  marble: { label: 'Marble', color: '#dcdad5', roughness: 0.15, metalness: 0, category: 'floor' },

  roof_tile: { label: 'Clay roof tile', color: '#8f4a33', roughness: 0.85, metalness: 0, category: 'roof' },
  roof_slate: { label: 'Slate', color: '#3f444b', roughness: 0.6, metalness: 0.1, category: 'roof' },
  roof_metal: { label: 'Metal sheet', color: '#7d848c', roughness: 0.35, metalness: 0.8, category: 'roof' },
  roof_concrete: { label: 'Concrete slab', color: '#9d9a93', roughness: 0.85, metalness: 0, category: 'roof' },
};

export const DEFAULT_WALL_MATERIAL = 'plaster';
export const DEFAULT_FLOOR_MATERIAL = 'concrete_floor';

export function preset(key: string | undefined, fallback: string): MaterialPreset {
  return MATERIALS[key ?? fallback] ?? MATERIALS[fallback];
}

export const materialsOf = (category: MaterialPreset['category']) =>
  Object.entries(MATERIALS).filter(([, m]) => m.category === category);
