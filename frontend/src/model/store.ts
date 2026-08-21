import { create } from 'zustand';
import type { Level, Opening, Project, Roof, SunSettings, Wall } from './types';
import { DEFAULT_ROOF, DEFAULT_SUN, uid } from './types';
import { DEFAULT_FLOOR_MATERIAL } from './materials';
import { levelBounds } from './geometry';

export interface Selection {
  kind: 'wall' | 'opening' | null;
  id: string | null;
}

export type ViewMode = 'orbit' | 'walk';

/** Scanned plan shown under the 2D editor for checking an import. Session-only, not saved. */
export interface Underlay {
  url: string;
  /** plan metres covered by the full image width */
  widthM: number;
  /** plan position of the image's bottom-left corner */
  origin: [number, number];
  opacity: number;
}

interface State {
  project: Project;
  activeLevelId: string;
  selection: Selection;
  dirty: boolean;
  remoteId: string | null; // id on the backend, once saved
  viewMode: ViewMode;
  underlay: Underlay | null;

  level(): Level;
  setUnderlay(u: Underlay | null): void;
  updateUnderlay(patch: Partial<Underlay>): void;
  setProject(p: Project, remoteId?: string | null): void;
  setProjectName(name: string): void;
  setRemoteId(id: string | null): void;
  markSaved(): void;
  select(sel: Selection): void;
  setViewMode(m: ViewMode): void;

  addWall(w: Omit<Wall, 'id'>): string;
  updateWall(id: string, patch: Partial<Wall>): void;
  removeWall(id: string): void;

  addOpening(o: Omit<Opening, 'id'>): string;
  updateOpening(id: string, patch: Partial<Opening>): void;
  removeOpening(id: string): void;

  rebuildFloor(): void;
  setFloorMaterial(material: string): void;
  setLevelHeight(h: number): void;

  setActiveLevel(id: string): void;
  addLevel(): void;
  removeLevel(id: string): void;
  renameLevel(name: string): void;
  setRoof(patch: Partial<Roof> | null): void;
  setSun(patch: Partial<SunSettings>): void;
}

/** Level elevations are derived: each level sits on top of the one below. */
function restack(p: Project) {
  let e = 0;
  for (const l of p.levels) {
    l.elevation = e;
    e += l.height;
  }
}

/** Upgrade documents saved by earlier versions. */
export function migrate(p: Project): Project {
  p.sun = { ...DEFAULT_SUN, ...(p.sun ?? {}) };
  restack(p);
  return p;
}

export function sampleProject(): Project {
  const lvl: Level = {
    id: uid(),
    name: 'Ground floor',
    elevation: 0,
    height: 2.7,
    walls: [],
    openings: [],
    floors: [],
    roof: { ...DEFAULT_ROOF },
  };
  const t = 0.2;
  const mk = (s: [number, number], e: [number, number], material?: string): Wall => ({
    id: uid(), start: s, end: e, thickness: t, height: 2.7, material,
  });
  lvl.walls = [
    mk([0, 0], [8, 0], 'plaster_warm'),
    mk([8, 0], [8, 6], 'plaster_warm'),
    mk([8, 6], [0, 6], 'plaster_warm'),
    mk([0, 6], [0, 0], 'plaster_warm'),
    mk([4, 0], [4, 6]),
  ];
  lvl.openings = [
    { id: uid(), wallId: lvl.walls[0].id, type: 'door', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 },
    { id: uid(), wallId: lvl.walls[0].id, type: 'window', offset: 5.5, width: 1.5, height: 1.2, sillHeight: 0.9 },
    { id: uid(), wallId: lvl.walls[2].id, type: 'window', offset: 1, width: 1.8, height: 1.2, sillHeight: 0.9 },
    { id: uid(), wallId: lvl.walls[4].id, type: 'door', offset: 2.5, width: 0.9, height: 2.1, sillHeight: 0 },
  ];
  lvl.floors = [{ id: uid(), polygon: [[0, 0], [8, 0], [8, 6], [0, 6]], material: 'oak' }];
  return { id: uid(), name: 'Sample house', units: 'm', levels: [lvl], sun: { ...DEFAULT_SUN } };
}

export const useStore = create<State>((set, get) => {
  const project = sampleProject();

  const mutate = (fn: (p: Project) => void) =>
    set((s) => {
      const p = structuredClone(s.project);
      fn(p);
      restack(p);
      return { project: p, dirty: true };
    });
  const mutateLevel = (fn: (l: Level) => void) =>
    mutate((p) => fn(p.levels.find((x) => x.id === get().activeLevelId)!));

  return {
    project,
    activeLevelId: project.levels[0].id,
    selection: { kind: null, id: null },
    dirty: false,
    remoteId: null,
    viewMode: 'orbit',
    underlay: null,

    setUnderlay: (underlay) => set({ underlay }),
    updateUnderlay: (patch) => set((s) => (s.underlay ? { underlay: { ...s.underlay, ...patch } } : {})),

    level: () => get().project.levels.find((l) => l.id === get().activeLevelId)!,
    setProject: (p, remoteId = null) => {
      const m = migrate(structuredClone(p));
      set({ project: m, activeLevelId: m.levels[0].id, selection: { kind: null, id: null }, dirty: false, remoteId });
    },
    setProjectName: (name) => set((s) => ({ project: { ...s.project, name }, dirty: true })),
    setRemoteId: (remoteId) => set({ remoteId }),
    markSaved: () => set({ dirty: false }),
    select: (selection) => set({ selection }),
    setViewMode: (viewMode) => set({ viewMode }),

    addWall: (w) => {
      const id = uid();
      mutateLevel((l) => l.walls.push({ ...w, id }));
      return id;
    },
    updateWall: (id, patch) =>
      mutateLevel((l) => {
        const w = l.walls.find((x) => x.id === id);
        if (w) Object.assign(w, patch);
      }),
    removeWall: (id) => {
      mutateLevel((l) => {
        l.walls = l.walls.filter((w) => w.id !== id);
        l.openings = l.openings.filter((o) => o.wallId !== id);
      });
      set({ selection: { kind: null, id: null } });
    },

    addOpening: (o) => {
      const id = uid();
      mutateLevel((l) => l.openings.push({ ...o, id }));
      return id;
    },
    updateOpening: (id, patch) =>
      mutateLevel((l) => {
        const o = l.openings.find((x) => x.id === id);
        if (o) Object.assign(o, patch);
      }),
    removeOpening: (id) => {
      mutateLevel((l) => {
        l.openings = l.openings.filter((o) => o.id !== id);
      });
      set({ selection: { kind: null, id: null } });
    },

    // Phase-2 simplification: floor = bounding box of all walls.
    rebuildFloor: () =>
      mutateLevel((l) => {
        const b = levelBounds(l);
        if (!b) return;
        const material = l.floors[0]?.material ?? DEFAULT_FLOOR_MATERIAL;
        l.floors = [{ id: uid(), polygon: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], material }];
      }),
    setFloorMaterial: (material) => mutateLevel((l) => l.floors.forEach((f) => (f.material = material))),
    setLevelHeight: (h) =>
      mutateLevel((l) => {
        l.height = h;
        l.walls.forEach((w) => (w.height = h));
      }),

    setActiveLevel: (activeLevelId) => set({ activeLevelId, selection: { kind: null, id: null } }),
    addLevel: () => {
      const id = uid();
      mutate((p) => {
        const below = p.levels[p.levels.length - 1];
        // New top level copies the outline of the one below and takes over the roof.
        const walls = below.walls.map((w) => ({ ...w, id: uid() }));
        const roof = below.roof ?? { ...DEFAULT_ROOF };
        delete below.roof;
        p.levels.push({
          id,
          name: `Level ${p.levels.length}`,
          elevation: 0,
          height: below.height,
          walls,
          openings: [],
          floors: below.floors.map((f) => ({ ...f, id: uid() })),
          roof,
        });
      });
      set({ activeLevelId: id, selection: { kind: null, id: null } });
    },
    removeLevel: (id) => {
      const p = get().project;
      if (p.levels.length <= 1) return;
      mutate((q) => {
        const idx = q.levels.findIndex((l) => l.id === id);
        const [removed] = q.levels.splice(idx, 1);
        if (removed.roof && q.levels.length) q.levels[q.levels.length - 1].roof ??= removed.roof;
      });
      set({ activeLevelId: get().project.levels[0].id, selection: { kind: null, id: null } });
    },
    renameLevel: (name) => mutateLevel((l) => (l.name = name)),
    setRoof: (patch) =>
      mutateLevel((l) => {
        if (patch === null) delete l.roof;
        else l.roof = { ...DEFAULT_ROOF, ...(l.roof ?? {}), ...patch };
      }),
    setSun: (patch) => mutate((p) => Object.assign(p.sun, patch)),
  };
});
