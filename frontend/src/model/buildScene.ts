import * as THREE from 'three';
import type { Project } from './types';
import { buildFloorGeometry, buildRoofGeometry, buildWallGeometry } from './geometry';
import { DEFAULT_FLOOR_MATERIAL, DEFAULT_WALL_MATERIAL, preset } from './materials';
import { sunDirection, sunPosition } from './sun';

/** A pleasant three-quarter view framing the whole building — used when no viewport camera exists. */
export function defaultCamera(project: Project, aspect: number): THREE.PerspectiveCamera {
  const box = new THREE.Box3();
  for (const l of project.levels) {
    for (const w of l.walls) {
      box.expandByPoint(new THREE.Vector3(w.start[0], l.elevation, -w.start[1]));
      box.expandByPoint(new THREE.Vector3(w.end[0], l.elevation + w.height + 2, -w.end[1]));
    }
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const cam = new THREE.PerspectiveCamera(45, aspect, 0.05, 500);
  const dist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 0.9;
  cam.position.set(centre.x + dist * 0.6, centre.y + dist * 0.45, centre.z + dist * 0.65);
  cam.lookAt(centre.x, centre.y - radius * 0.2, centre.z);
  cam.updateProjectionMatrix();
  return cam;
}

export interface BuiltScene {
  scene: THREE.Scene;
  /** Only the building (walls, floors, roofs) — what gets exported. */
  building: THREE.Group;
  sun: THREE.DirectionalLight;
  dispose(): void;
}

/**
 * A plain Three.js scene built straight from the project document, independent of the
 * interactive r3f view. Used by the path tracer and the glTF/USDZ exporters so all three
 * outputs agree exactly on geometry and materials.
 */
export function buildScene(project: Project, opts: { ground?: boolean } = {}): BuiltScene {
  const scene = new THREE.Scene();
  const building = new THREE.Group();
  building.name = project.name;
  scene.add(building);

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (key: string | undefined, fallback: string) => {
    const k = key ?? fallback;
    let m = materials.get(k);
    if (!m) {
      const p = preset(k, fallback);
      // Human-readable name (e.g. "Red brick") so external tools like D5 Render / Blender show
      // a sensible material list, not raw preset keys like "brick".
      m = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness, name: p.label });
      materials.set(k, m);
    }
    return m;
  };

  const geometries: THREE.BufferGeometry[] = [];
  for (const level of project.levels) {
    const group = new THREE.Group();
    group.name = level.name;
    building.add(group);

    for (const w of level.walls) {
      const geo = buildWallGeometry(w, level.openings.filter((o) => o.wallId === w.id), level.elevation);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, mat(w.material, DEFAULT_WALL_MATERIAL));
      mesh.name = `wall_${w.id}`;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const f of level.floors) {
      const geo = buildFloorGeometry(f.polygon, level.elevation);
      geometries.push(geo);
      const m = mat(f.material, DEFAULT_FLOOR_MATERIAL);
      m.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = `floor_${f.id}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (level.roof) {
      const geo = buildRoofGeometry(level, level.roof);
      if (geo) {
        geometries.push(geo);
        const m = mat(level.roof.material, 'roof_tile');
        m.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(geo, m);
        mesh.name = `roof_${level.id}`;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }

  const { elevation } = sunPosition(project.sun);
  const daylight = THREE.MathUtils.clamp(elevation / 15, 0, 1);
  const sun = new THREE.DirectionalLight(daylight < 0.5 ? '#ffc9a0' : '#fff4e6', 2 + 4 * daylight);
  sun.position.set(...sunDirection(project.sun, 60));
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  scene.add(sun, sun.target);

  if (opts.ground) {
    const geo = new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2);
    geometries.push(geo);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#6e7a5c', roughness: 1 }));
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);
  }

  return {
    scene,
    building,
    sun,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
