import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { Level, Opening, Roof, Wall } from './types';

const evaluator = new Evaluator();

export function wallLength(w: Wall) {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
}

export function wallAngle(w: Wall) {
  return Math.atan2(w.end[1] - w.start[1], w.end[0] - w.start[0]);
}

/** Axis-aligned bounding box of a level's walls in plan coordinates, or null if it has none. */
export function levelBounds(level: Level): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!level.walls.length) return null;
  const xs = level.walls.flatMap((w) => [w.start[0], w.end[0]]);
  const ys = level.walls.flatMap((w) => [w.start[1], w.end[1]]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * Builds the 3D geometry for one wall with its openings subtracted.
 * Returned geometry is in world space (plan y -> -z, wall base at y = elevation).
 */
export function buildWallGeometry(wall: Wall, openings: Opening[], elevation = 0): THREE.BufferGeometry {
  const len = wallLength(wall);
  if (len < 1e-6) return new THREE.BufferGeometry();
  const angle = wallAngle(wall);

  // Local space: x along the wall, y up, z across the thickness.
  let result = new Brush(new THREE.BoxGeometry(len, wall.height, wall.thickness));
  result.position.set(len / 2, wall.height / 2, 0);
  result.updateMatrixWorld();

  for (const o of openings) {
    const cutter = new Brush(new THREE.BoxGeometry(o.width, o.height, wall.thickness + 0.02));
    cutter.position.set(o.offset + o.width / 2, o.sillHeight + o.height / 2, 0);
    cutter.updateMatrixWorld();
    result = evaluator.evaluate(result, cutter, SUBTRACTION);
  }

  // The evaluator returns geometry in the first brush's local frame; bake that frame in first.
  const geo = result.geometry.clone();
  geo.applyMatrix4(result.matrixWorld);
  // Plan (x, y) -> world (x, -z). Rotating by `angle` about Y maps local +x onto that direction.
  const m = new THREE.Matrix4()
    .makeTranslation(wall.start[0], elevation, -wall.start[1])
    .multiply(new THREE.Matrix4().makeRotationY(angle));
  geo.applyMatrix4(m);
  geo.computeVertexNormals();
  return geo;
}

export function buildFloorGeometry(polygon: [number, number][], elevation = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  // ShapeGeometry lies in XY; rotate so plan y -> -z and the face points up.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, elevation + 0.001, 0);
  return geo;
}

/**
 * Roof over the level's bounding box. Phase 2 keeps this rectangular; L-shaped
 * footprints get a rectangular roof that covers them.
 */
export function buildRoofGeometry(level: Level, roof: Roof): THREE.BufferGeometry | null {
  const b = levelBounds(level);
  if (!b || roof.type === 'none') return null;

  const top = level.elevation + level.height;
  const ov = roof.overhang;
  const x0 = b.x0 - ov, x1 = b.x1 + ov, z0 = -(b.y1 + ov), z1 = -(b.y0 - ov);
  const w = x1 - x0, d = z1 - z0;

  if (roof.type === 'flat') {
    const geo = new THREE.BoxGeometry(w, roof.thickness, d);
    geo.translate((x0 + x1) / 2, top + roof.thickness / 2, (z0 + z1) / 2);
    return geo;
  }

  const pitch = (roof.pitch * Math.PI) / 180;
  // Ridge runs along the longer axis.
  const ridgeAlongX = w >= d;
  const halfSpan = (ridgeAlongX ? d : w) / 2;
  const rise = Math.tan(pitch) * halfSpan;

  const verts: number[] = [];
  const tri = (a: number[], bb: number[], c: number[]) => verts.push(...a, ...bb, ...c);
  const quad = (a: number[], bb: number[], c: number[], dd: number[]) => {
    tri(a, bb, c);
    tri(a, c, dd);
  };

  // Eave corners (counter-clockwise seen from above).
  const A = [x0, top, z1], B = [x1, top, z1], C = [x1, top, z0], D = [x0, top, z0];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  if (roof.type === 'gable') {
    if (ridgeAlongX) {
      const R0 = [x0, top + rise, cz], R1 = [x1, top + rise, cz];
      quad(A, B, R1, R0); // south slope
      quad(C, D, R0, R1); // north slope
      tri(B, C, R1); // east gable end
      tri(D, A, R0); // west gable end
    } else {
      const R0 = [cx, top + rise, z1], R1 = [cx, top + rise, z0];
      quad(B, C, R1, R0); // east slope
      quad(D, A, R0, R1); // west slope
      tri(A, B, R0);
      tri(C, D, R1);
    }
  } else {
    // hip: ridge shortened by halfSpan at each end so hip slopes are at the same pitch.
    if (ridgeAlongX) {
      const R0 = [x0 + halfSpan, top + rise, cz], R1 = [x1 - halfSpan, top + rise, cz];
      quad(A, B, R1, R0);
      quad(C, D, R0, R1);
      tri(B, C, R1);
      tri(D, A, R0);
    } else {
      const R0 = [cx, top + rise, z1 - halfSpan], R1 = [cx, top + rise, z0 + halfSpan];
      quad(B, C, R1, R0);
      quad(D, A, R0, R1);
      tri(A, B, R0);
      tri(C, D, R1);
    }
  }
  // Underside (ceiling of the roof space) so it isn't see-through from below.
  quad(D, C, B, A);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}
