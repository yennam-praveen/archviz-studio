import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text } from 'react-konva';
import type Konva from 'konva';
import { useStore } from '../model/store';
import { wallAngle } from '../model/geometry';

const SCALE = 40; // px per metre
const SNAP = 0.1; // m
const PAD = 1; // m margin around origin

const snap = (v: number) => Math.round(v / SNAP) * SNAP;

interface Props {
  drawMode: boolean;
  onDrawDone(): void;
}

export function Plan2D({ drawMode, onDrawDone }: Props) {
  const level = useStore((s) => s.project.levels.find((l) => l.id === s.activeLevelId)!);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const addWall = useStore((s) => s.addWall);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [drawStart, setDrawStart] = useState<[number, number] | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Plan (x, y) metres -> screen px. y grows north, screen grows down, so flip.
  const toPx = (x: number, y: number): [number, number] => [
    (x + PAD) * SCALE,
    size.h - (y + PAD) * SCALE,
  ];
  const fromPx = (px: number, py: number): [number, number] => [
    snap(px / SCALE - PAD),
    snap((size.h - py) / SCALE - PAD),
  ];

  const stagePos = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const p = e.target.getStage()?.getPointerPosition();
    return p ? fromPx(p.x, p.y) : null;
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const p = stagePos(e);
    if (!p) return;
    if (drawMode) {
      if (!drawStart) {
        setDrawStart(p);
      } else {
        if (p[0] !== drawStart[0] || p[1] !== drawStart[1]) {
          addWall({ start: drawStart, end: p, thickness: 0.2, height: level.height });
        }
        setDrawStart(null);
        onDrawDone();
      }
      return;
    }
    if (e.target === e.target.getStage()) select({ kind: null, id: null });
  };

  const gridLines = [];
  for (let m = 0; m * SCALE < size.w + size.h; m++) {
    const [gx] = toPx(m - PAD, 0);
    const [, gy] = toPx(0, m - PAD);
    const major = (m - PAD) % 5 === 0;
    gridLines.push(
      <Line key={`v${m}`} points={[gx, 0, gx, size.h]} stroke={major ? '#3a3f4b' : '#262a33'} strokeWidth={1} />,
      <Line key={`h${m}`} points={[0, gy, size.w, gy]} stroke={major ? '#3a3f4b' : '#262a33'} strokeWidth={1} />,
    );
  }

  return (
    <div ref={containerRef} className="plan2d" style={{ cursor: drawMode ? 'crosshair' : 'default' }}>
      <Stage
        width={size.w}
        height={size.h}
        onClick={onStageClick}
        onMouseMove={(e) => setCursor(stagePos(e))}
      >
        <Layer listening={false}>{gridLines}</Layer>
        <Layer>
          {level.walls.map((w) => {
            const [x1, y1] = toPx(...w.start);
            const [x2, y2] = toPx(...w.end);
            const selected = selection.kind === 'wall' && selection.id === w.id;
            return (
              <Line
                key={w.id}
                points={[x1, y1, x2, y2]}
                stroke={selected ? '#ffb454' : '#d7dae0'}
                strokeWidth={Math.max(2, w.thickness * SCALE)}
                lineCap="butt"
                onClick={(e) => {
                  if (drawMode) return;
                  e.cancelBubble = true;
                  select({ kind: 'wall', id: w.id });
                }}
              />
            );
          })}
          {level.openings.map((o) => {
            const w = level.walls.find((x) => x.id === o.wallId);
            if (!w) return null;
            const a = wallAngle(w);
            const sx = w.start[0] + Math.cos(a) * o.offset;
            const sy = w.start[1] + Math.sin(a) * o.offset;
            const ex = sx + Math.cos(a) * o.width;
            const ey = sy + Math.sin(a) * o.width;
            const [x1, y1] = toPx(sx, sy);
            const [x2, y2] = toPx(ex, ey);
            const selected = selection.kind === 'opening' && selection.id === o.id;
            return (
              <Line
                key={o.id}
                points={[x1, y1, x2, y2]}
                stroke={selected ? '#ffb454' : o.type === 'door' ? '#6cc070' : '#5aa9ff'}
                strokeWidth={Math.max(2, w.thickness * SCALE) + 2}
                onClick={(e) => {
                  if (drawMode) return;
                  e.cancelBubble = true;
                  select({ kind: 'opening', id: o.id });
                }}
              />
            );
          })}
          {drawMode && drawStart && cursor && (
            <Line
              points={[...toPx(...drawStart), ...toPx(...cursor)]}
              stroke="#ffb454"
              strokeWidth={4}
              dash={[8, 6]}
              listening={false}
            />
          )}
          {drawMode && drawStart && <Circle {...pt(toPx(...drawStart))} radius={5} fill="#ffb454" listening={false} />}
          {cursor && (
            <Text
              x={8}
              y={8}
              text={`x ${cursor[0].toFixed(1)} m   y ${cursor[1].toFixed(1)} m${
                drawStart ? `   len ${Math.hypot(cursor[0] - drawStart[0], cursor[1] - drawStart[1]).toFixed(2)} m` : ''
              }`}
              fill="#9aa3b2"
              fontSize={12}
              fontFamily="monospace"
              listening={false}
            />
          )}
          <Rect x={0} y={0} width={0} height={0} />
        </Layer>
      </Stage>
    </div>
  );
}

const pt = ([x, y]: [number, number]) => ({ x, y });
