// Core data model. The 2D plan and the 3D scene are both pure renderers of this.
// Units: metres. Plan coordinates: x = east, y = north (mapped to 3D x / -z).

export type Units = 'm' | 'ft';

export interface Wall {
  id: string;
  start: [number, number];
  end: [number, number];
  thickness: number; // m
  height: number; // m
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

export interface Level {
  id: string;
  name: string;
  elevation: number; // m
  height: number; // default wall height for this level
  walls: Wall[];
  openings: Opening[];
  floors: Floor[];
}

export interface Project {
  id: string;
  name: string;
  units: Units;
  levels: Level[];
}

export const uid = () => Math.random().toString(36).slice(2, 10);
