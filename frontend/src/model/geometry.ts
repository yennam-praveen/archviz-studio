import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { Opening, Wall } from './types';

const evaluator = new Evaluator();

export function wallLength(w: Wall) {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
}

export function wallAngle(w: Wall) {
  return Math.atan2(w.end[1] - w.start[1], w.end[0] - w.start[0]);
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
