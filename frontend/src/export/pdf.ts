import { jsPDF } from 'jspdf';
import type { Level, Project } from '../model/types';
import { levelBounds, wallAngle, wallLength } from '../model/geometry';
import { preset, DEFAULT_WALL_MATERIAL, DEFAULT_FLOOR_MATERIAL } from '../model/materials';
import { safeName } from './download';

// A3 landscape in mm.
const PAGE_W = 420, PAGE_H = 297, MARGIN = 20, TITLE_H = 28;
const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];

function pickScale(level: Level) {
  const b = levelBounds(level);
  if (!b) return 100;
  const availW = PAGE_W - 2 * MARGIN - 30; // room for dimension strings
  const availH = PAGE_H - 2 * MARGIN - TITLE_H - 30;
  const wM = b.x1 - b.x0 + 2, hM = b.y1 - b.y0 + 2;
  return SCALES.find((s) => (wM * 1000) / s <= availW && (hM * 1000) / s <= availH) ?? SCALES[SCALES.length - 1];
}

function drawLevel(doc: jsPDF, project: Project, level: Level, pageIndex: number, pageCount: number) {
  const scale = pickScale(level);
  const b = levelBounds(level) ?? { x0: 0, x1: 1, y0: 0, y1: 1 };
  const mm = (m: number) => (m * 1000) / scale;

  // Centre the drawing in the available area; plan y grows north -> page y grows down.
  const drawW = mm(b.x1 - b.x0), drawH = mm(b.y1 - b.y0);
  const ox = MARGIN + (PAGE_W - 2 * MARGIN - drawW) / 2;
  const oy = MARGIN + (PAGE_H - 2 * MARGIN - TITLE_H - drawH) / 2;
  const X = (x: number) => ox + mm(x - b.x0);
  const Y = (y: number) => oy + mm(b.y1 - y);

  // Floors
  doc.setFillColor(238, 236, 230);
  for (const f of level.floors) {
    doc.setDrawColor(200);
    const pts = f.polygon.map(([x, y]) => [X(x), Y(y)] as [number, number]);
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
  }

  // Walls as filled rectangles with thickness
  doc.setFillColor(40, 40, 40);
  doc.setDrawColor(40);
  doc.setLineWidth(0.2);
  for (const w of level.walls) {
    const a = wallAngle(w);
    const nx = -Math.sin(a) * w.thickness / 2, ny = Math.cos(a) * w.thickness / 2;
    const c = [
      [w.start[0] + nx, w.start[1] + ny], [w.end[0] + nx, w.end[1] + ny],
      [w.end[0] - nx, w.end[1] - ny], [w.start[0] - nx, w.start[1] - ny],
    ].map(([x, y]) => [X(x), Y(y)]);
    doc.lines(c.slice(1).map((p, i) => [p[0] - c[i][0], p[1] - c[i][1]]), c[0][0], c[0][1], [1, 1], 'FD', true);
  }

  // Openings: white gap + symbol
  for (const o of level.openings) {
    const w = level.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const a = wallAngle(w);
    const ux = Math.cos(a), uy = Math.sin(a);
    const nx = -uy * (w.thickness / 2 + 0.01), ny = ux * (w.thickness / 2 + 0.01);
    const s: [number, number] = [w.start[0] + ux * o.offset, w.start[1] + uy * o.offset];
    const e: [number, number] = [s[0] + ux * o.width, s[1] + uy * o.width];
    const c = [[s[0] + nx, s[1] + ny], [e[0] + nx, e[1] + ny], [e[0] - nx, e[1] - ny], [s[0] - nx, s[1] - ny]].map(([x, y]) => [X(x), Y(y)]);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255);
    doc.lines(c.slice(1).map((p, i) => [p[0] - c[i][0], p[1] - c[i][1]]), c[0][0], c[0][1], [1, 1], 'FD', true);
    doc.setLineWidth(0.25);
    if (o.type === 'door') {
      // Swing arc from the hinge at the opening start.
      doc.setDrawColor(60);
      const r = mm(o.width);
      const hinge = [X(s[0]), Y(s[1])];
      const leaf = [X(s[0] - uy * o.width), Y(s[1] + ux * o.width)];
      doc.line(hinge[0], hinge[1], leaf[0], leaf[1]);
      const steps = 12;
      let px = X(e[0]), py = Y(e[1]);
      for (let i = 1; i <= steps; i++) {
        const t = (Math.PI / 2) * (i / steps);
        const qx = hinge[0] + r * (Math.cos(t) * Math.cos(-a) - Math.sin(t) * Math.sin(-a));
        const qy = hinge[1] + r * (Math.cos(t) * Math.sin(-a) + Math.sin(t) * Math.cos(-a));
        doc.line(px, py, qx, qy);
        px = qx; py = qy;
      }
    } else {
      // Window: two thin lines across the gap.
      doc.setDrawColor(40);
      for (const k of [-0.3, 0.3]) {
        const kx = -uy * w.thickness * k, ky = ux * w.thickness * k;
        doc.line(X(s[0] + kx), Y(s[1] + ky), X(e[0] + kx), Y(e[1] + ky));
      }
    }
  }

  // Dimension strings on every wall (offset to the outside for perimeter walls).
  doc.setFontSize(7);
  doc.setTextColor(30);
  doc.setDrawColor(90);
  doc.setLineWidth(0.15);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  for (const w of level.walls) {
    const L = wallLength(w);
    if (L < 0.05) continue;
    const a = wallAngle(w);
    const mx = (w.start[0] + w.end[0]) / 2, my = (w.start[1] + w.end[1]) / 2;
    // Normal pointing away from the plan centre.
    let nx = -Math.sin(a), ny = Math.cos(a);
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const off = w.thickness / 2 + 0.6;
    const p1 = [X(w.start[0] + nx * off), Y(w.start[1] + ny * off)];
    const p2 = [X(w.end[0] + nx * off), Y(w.end[1] + ny * off)];
    doc.line(p1[0], p1[1], p2[0], p2[1]);
    for (const [px, py] of [p1, p2]) doc.line(px - 1, py + 1, px + 1, py - 1);
    const tx = X(mx + nx * (off + 0.35)), ty = Y(my + ny * (off + 0.35));
    doc.text(`${(L * 1000).toFixed(0)}`, tx, ty, { align: 'center', baseline: 'middle' });
  }

  // Title block
  const tbY = PAGE_H - MARGIN - TITLE_H;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, tbY, PAGE_W - 2 * MARGIN, TITLE_H);
  doc.line(MARGIN + 200, tbY, MARGIN + 200, tbY + TITLE_H);
  doc.line(MARGIN + 300, tbY, MARGIN + 300, tbY + TITLE_H);
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(project.name, MARGIN + 4, tbY + 10);
  doc.setFontSize(9);
  doc.text(`${level.name}  ·  floor level +${level.elevation.toFixed(2)} m  ·  wall height ${level.height.toFixed(2)} m`, MARGIN + 4, tbY + 18);
  doc.text(`Walls: ${[...new Set(level.walls.map((w) => preset(w.material, DEFAULT_WALL_MATERIAL).label))].join(', ')}`, MARGIN + 4, tbY + 24);
  doc.text(`Floor: ${level.floors.map((f) => preset(f.material, DEFAULT_FLOOR_MATERIAL).label).join(', ') || '—'}`, MARGIN + 204, tbY + 10);
  doc.text(`Roof: ${level.roof ? `${level.roof.type}${level.roof.type !== 'flat' ? ` ${level.roof.pitch}°` : ''}` : '—'}`, MARGIN + 204, tbY + 18);
  doc.text(`Dimensions in mm`, MARGIN + 204, tbY + 24);
  doc.setFontSize(12);
  doc.text(`SCALE 1:${scale} @ A3`, MARGIN + 304, tbY + 10);
  doc.setFontSize(9);
  doc.text(`Sheet ${pageIndex + 1} / ${pageCount}`, MARGIN + 304, tbY + 18);
  doc.text(`ArchViz Studio · ${new Date().toISOString().slice(0, 10)}`, MARGIN + 304, tbY + 24);

  // Scale bar (1 m ticks) and north arrow
  const sbX = MARGIN + 4, sbY = tbY - 6, metres = Math.min(5, Math.max(1, Math.floor((b.x1 - b.x0) / 2)));
  doc.setLineWidth(0.3);
  for (let i = 0; i < metres; i++) {
    if (i % 2 === 0) doc.setFillColor(0, 0, 0); else doc.setFillColor(255, 255, 255);
    doc.rect(sbX + mm(i), sbY, mm(1), 1.5, 'FD');
  }
  doc.setFontSize(7);
  doc.text(`0`, sbX, sbY - 1.5, { align: 'center' });
  doc.text(`${metres} m`, sbX + mm(metres), sbY - 1.5, { align: 'center' });

  const naX = PAGE_W - MARGIN - 12, naY = MARGIN + 14;
  const rot = ((project.sun.northOffset ?? 0) * Math.PI) / 180;
  const tip = [naX + Math.sin(rot) * 9, naY - Math.cos(rot) * 9];
  doc.setLineWidth(0.5);
  doc.line(naX, naY, tip[0], tip[1]);
  doc.circle(naX, naY, 1.2, 'F');
  doc.setFontSize(9);
  doc.text('N', tip[0], tip[1] - 2, { align: 'center' });
}

export function exportPlanPDF(project: Project) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  project.levels.forEach((level, i) => {
    if (i > 0) doc.addPage();
    drawLevel(doc, project, level, i, project.levels.length);
  });
  doc.save(`${safeName(project.name)}_plans.pdf`);
}
