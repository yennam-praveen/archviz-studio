// Core data model. The 2D plan and the 3D scene are both pure renderers of this.
// Units: metres. Plan coordinates: x = east, y = north (mapped to 3D x / -z).

export type Units = 'm' | 'ft';

export interface Wall {
  id: string;
  start: [number, number];
  end: [number, number];
  thickness: number; // m
  height: number; // m
  material?: string; // key into materials.ts presets; default plaster
}

export type OpeningType = 'door' | 'window';

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  offset: number; // m from wall start to the opening's left edge
  width: number; // m
  height: number; // m
  sillHeight: number; // m above floor (0 for doors)
}

export interface Floor {
  id: string;
  polygon: [number, number][];
  material: string;
}

export type RoofType = 'none' | 'flat' | 'gable' | 'hip';

export interface Roof {
  type: RoofType;
  pitch: number; // degrees, for gable/hip
  overhang: number; // m beyond the walls
  thickness: number; // m (flat slab / roof skin)
  material: string;
}

export interface Level {
  id: string;
  name: string;
  elevation: number; // m, derived from the levels below
  height: number; // default wall height for this level
  walls: Wall[];
  openings: Opening[];
  floors: Floor[];
  roof?: Roof; // normally only on the top level
}

export interface SunSettings {
  latitude: number; // degrees, +N
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-24, local solar time
  northOffset: number; // degrees: rotation of plan "north" (+y) from true north, clockwise
}

export interface Project {
  id: string;
  name: string;
  units: Units;
  levels: Level[];
  sun: SunSettings;
}

export const DEFAULT_SUN: SunSettings = { latitude: -20.2, month: 6, day: 21, hour: 14, northOffset: 0 };

export const DEFAULT_ROOF: Roof = { type: 'gable', pitch: 25, overhang: 0.5, thickness: 0.25, material: 'roof_tile' };

export const uid = () => Math.random().toString(36).slice(2, 10);
