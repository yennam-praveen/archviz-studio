import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import type { Project } from '../model/types';
import { buildScene } from '../model/buildScene';
import { downloadBlob, safeName } from './download';

/** Binary glTF — opens in Blender, Twinmotion, SketchUp, Revit (via plugin), three.js. */
export async function exportGLB(project: Project) {
  const built = buildScene(project);
  try {
    const result = await new GLTFExporter().parseAsync(built.building, { binary: true });
    downloadBlob(result as ArrayBuffer, `${safeName(project.name)}.glb`, 'model/gltf-binary');
  } finally {
    built.dispose();
  }
}

/** USDZ — opens natively on iPhone/iPad (AR Quick Look) and in Apple's Reality Composer. */
export async function exportUSDZ(project: Project) {
  const built = buildScene(project);
  try {
    // USDZ has no double-sided flag; our floor/roof normals face up anyway.
    built.building.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.side = THREE.FrontSide;
    });
    const bytes = await new USDZExporter().parseAsync(built.building);
    downloadBlob(bytes, `${safeName(project.name)}.usdz`, 'model/vnd.usdz+zip');
  } finally {
    built.dispose();
  }
}
