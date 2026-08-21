import { create } from 'zustand';
import type { Level, Opening, Project, Wall } from './types';
import { uid } from './types';

export interface Selection {
  kind: 'wall' | 'opening' | null;
  id: string | null;
}

interface State {
  project: Project;
  activeLevelId: string;
  selection: Selection;
  dirty: boolean;
  remoteId: string | null; // id on the backend, once saved

  level(): Level;
  setProject(p: Project, remoteId?: string | null): void;
  setProjectName(name: string): void;
  setRemoteId(id: string | null): void;
  markSaved(): void;
  select(sel: Selection): void;

  addWall(w: Omit<Wall, 'id'>): string;
  updateWall(id: string, patch: Partial<Wall>): void;
  removeWall(id: string): void;

  addOpening(o: Omit<Opening, 'id'>): string;
  updateOpening(id: string, patch: Partial<Opening>): void;
  removeOpening(id: string): void;

  rebuildFloor(): void;
  setLevelHeight(h: number): void;
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
  };
  const t = 0.2;
  const mk = (s: [number, number], e: [number, number]): Wall => ({
    id: uid(), start: s, end: e, thickness: t, height: 2.7,
  });
  lvl.walls = [
    mk([0, 0], [8, 0]),
    mk([8, 0], [8, 6]),
    mk([8, 6], [0, 6]),
    mk([0, 6], [0, 0]),
    mk([4, 0], [4, 6]),
  ];
  lvl.openings = [
    { id: uid(), wallId: lvl.walls[0].id, type: 'door', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 },
    { id: uid(), wallId: lvl.walls[0].id, type: 'window', offset: 5.5, width: 1.5, height: 1.2, sillHeight: 0.9 },
    { id: uid(), wallId: lvl.walls[2].id, type: 'window', offset: 1, width: 1.8, height: 1.2, sillHeight: 0.9 },
    { id: uid(), wallId: lvl.walls[4].id, type: 'door', offset: 2.5, width: 0.9, height: 2.1, sillHeight: 0 },
  ];
  lvl.floors = [{ id: uid(), polygon: [[0, 0], [8, 0], [8, 6], [0, 6]], material: 'concrete' }];
  return { id: uid(), name: 'Sample house', units: 'm', levels: [lvl] };
}

export const useStore = create<State>((set, get) => {
  const project = sampleProject();
  const mutateLevel = (fn: (l: Level) => void) =>
    set((s) => {
      const p = structuredClone(s.project);
      const l = p.levels.find((x) => x.id === s.activeLevelId)!;
      fn(l);
      return { project: p, dirty: true };
    });

  return {
    project,
    activeLevelId: project.levels[0].id,
    selection: { kind: null, id: null },
    dirty: false,
    remoteId: null,

    level: () => get().project.levels.find((l) => l.id === get().activeLevelId)!,
    setProject: (p, remoteId = null) =>
      set({ project: p, activeLevelId: p.levels[0].id, selection: { kind: null, id: null }, dirty: false, remoteId }),
    setProjectName: (name) => set((s) => ({ project: { ...s.project, name }, dirty: true })),
    setRemoteId: (remoteId) => set({ remoteId }),
    markSaved: () => set({ dirty: false }),
    select: (selection) => set({ selection }),

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

    // Phase-1 simplification: floor = bounding box of all walls.
    rebuildFloor: () =>
      mutateLevel((l) => {
        if (!l.walls.length) return;
        const xs = l.walls.flatMap((w) => [w.start[0], w.end[0]]);
        const ys = l.walls.flatMap((w) => [w.start[1], w.end[1]]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        l.floors = [{ id: uid(), polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], material: 'concrete' }];
      }),
    setLevelHeight: (h) =>
      mutateLevel((l) => {
        l.height = h;
        l.walls.forEach((w) => (w.height = h));
      }),
  };
});
