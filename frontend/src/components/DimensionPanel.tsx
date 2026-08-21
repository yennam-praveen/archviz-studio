import { useState } from 'react';
import { useStore } from '../model/store';
import { wallLength } from '../model/geometry';
import type { OpeningType } from '../model/types';

type Dir = 'E' | 'N' | 'W' | 'S';
const DIRS: Record<Dir, [number, number]> = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] };

function Num({
  label, value, step = 0.1, min, onChange,
}: { label: string; value: number; step?: number; min?: number; onChange(v: number): void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? +value.toFixed(3) : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

export function DimensionPanel({ drawMode, setDrawMode }: { drawMode: boolean; setDrawMode(v: boolean): void }) {
  const level = useStore((s) => s.project.levels.find((l) => l.id === s.activeLevelId)!);
  const selection = useStore((s) => s.selection);
  const {
    addWall, updateWall, removeWall, addOpening, updateOpening, removeOpening, rebuildFloor, setLevelHeight, select,
  } = useStore();

  // Add-wall-by-dimensions form
  const [sx, setSx] = useState(0);
  const [sy, setSy] = useState(0);
  const [len, setLen] = useState(4);
  const [dir, setDir] = useState<Dir>('E');
  const [thick, setThick] = useState(0.2);

  const selWall = selection.kind === 'wall' ? level.walls.find((w) => w.id === selection.id) : undefined;
  const selOpening = selection.kind === 'opening' ? level.openings.find((o) => o.id === selection.id) : undefined;
  const openingWall = selOpening ? level.walls.find((w) => w.id === selOpening.wallId) : undefined;

  const submitWall = () => {
    const [dx, dy] = DIRS[dir];
    const id = addWall({
      start: [sx, sy],
      end: [sx + dx * len, sy + dy * len],
      thickness: thick,
      height: level.height,
    });
    // Chain: next wall starts where this one ended.
    setSx(sx + dx * len);
    setSy(sy + dy * len);
    select({ kind: 'wall', id });
  };

  const addOpeningTo = (type: OpeningType) => {
    if (!selWall) return;
    const L = wallLength(selWall);
    const width = type === 'door' ? 0.9 : 1.2;
    const id = addOpening({
      wallId: selWall.id,
      type,
      offset: Math.max(0, (L - width) / 2),
      width,
      height: type === 'door' ? 2.1 : 1.2,
      sillHeight: type === 'door' ? 0 : 0.9,
    });
    select({ kind: 'opening', id });
  };

  return (
    <aside className="panel">
      <section>
        <h3>Level: {level.name}</h3>
        <Num label="Wall height (m)" value={level.height} onChange={setLevelHeight} min={1} />
        <div className="row">
          <button onClick={rebuildFloor}>Rebuild floor</button>
          <button className={drawMode ? 'active' : ''} onClick={() => setDrawMode(!drawMode)}>
            {drawMode ? 'Drawing… (click 2 points)' : 'Draw wall on plan'}
          </button>
        </div>
      </section>

      <section>
        <h3>Add wall by dimensions</h3>
        <div className="grid2">
          <Num label="Start X" value={sx} onChange={setSx} />
          <Num label="Start Y" value={sy} onChange={setSy} />
          <Num label="Length (m)" value={len} onChange={setLen} min={0.1} />
          <label className="field">
            <span>Direction</span>
            <select value={dir} onChange={(e) => setDir(e.target.value as Dir)}>
              <option value="E">East (+X)</option>
              <option value="N">North (+Y)</option>
              <option value="W">West (−X)</option>
              <option value="S">South (−Y)</option>
            </select>
          </label>
          <Num label="Thickness (m)" value={thick} step={0.05} min={0.05} onChange={setThick} />
        </div>
        <button className="primary" onClick={submitWall}>Add wall</button>
        <p className="hint">Each new wall starts where the previous one ended, so you can type a room outline in sequence.</p>
      </section>

      {selWall && (
        <section>
          <h3>Wall <small>{wallLength(selWall).toFixed(2)} m</small></h3>
          <div className="grid2">
            <Num label="Start X" value={selWall.start[0]} onChange={(v) => updateWall(selWall.id, { start: [v, selWall.start[1]] })} />
            <Num label="Start Y" value={selWall.start[1]} onChange={(v) => updateWall(selWall.id, { start: [selWall.start[0], v] })} />
            <Num label="End X" value={selWall.end[0]} onChange={(v) => updateWall(selWall.id, { end: [v, selWall.end[1]] })} />
            <Num label="End Y" value={selWall.end[1]} onChange={(v) => updateWall(selWall.id, { end: [selWall.end[0], v] })} />
            <Num label="Thickness" value={selWall.thickness} step={0.05} min={0.05} onChange={(v) => updateWall(selWall.id, { thickness: v })} />
            <Num label="Height" value={selWall.height} min={0.5} onChange={(v) => updateWall(selWall.id, { height: v })} />
          </div>
          <div className="row">
            <button onClick={() => addOpeningTo('door')}>+ Door</button>
            <button onClick={() => addOpeningTo('window')}>+ Window</button>
            <button className="danger" onClick={() => removeWall(selWall.id)}>Delete wall</button>
          </div>
        </section>
      )}

      {selOpening && openingWall && (
        <section>
          <h3>{selOpening.type === 'door' ? 'Door' : 'Window'}</h3>
          <div className="grid2">
            <Num label="Offset from start" value={selOpening.offset} min={0} onChange={(v) => updateOpening(selOpening.id, { offset: v })} />
            <Num label="Width" value={selOpening.width} min={0.3} onChange={(v) => updateOpening(selOpening.id, { width: v })} />
            <Num label="Height" value={selOpening.height} min={0.3} onChange={(v) => updateOpening(selOpening.id, { height: v })} />
            <Num label="Sill height" value={selOpening.sillHeight} min={0} onChange={(v) => updateOpening(selOpening.id, { sillHeight: v })} />
          </div>
          {selOpening.offset + selOpening.width > wallLength(openingWall) + 1e-6 && (
            <p className="warn">Opening extends past the end of the wall.</p>
          )}
          {selOpening.sillHeight + selOpening.height > openingWall.height + 1e-6 && (
            <p className="warn">Opening is taller than the wall.</p>
          )}
          <div className="row">
            <button onClick={() => select({ kind: 'wall', id: openingWall.id })}>Select wall</button>
            <button className="danger" onClick={() => removeOpening(selOpening.id)}>Delete</button>
          </div>
        </section>
      )}

      {!selWall && !selOpening && (
        <p className="hint">Click a wall or opening in the plan or the 3D view to edit it.</p>
      )}
    </aside>
  );
}
