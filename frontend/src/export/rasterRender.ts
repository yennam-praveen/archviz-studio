import * as THREE from 'three';
import type { Project } from '../model/types';
import { buildScene } from '../model/buildScene';

/**
 * Fast high-resolution rasterized render: soft shadows, sky gradient, 2× supersampling.
 * Works on any WebGL2 GPU in under a second. Used as the default on weak GPUs and as an
 * automatic fallback when the path tracer cannot produce an image on the current driver.
 */
export function rasterRender(project: Project, camera: THREE.PerspectiveCamera, width: number, height: number): HTMLCanvasElement {
  const ss = width <= 1920 ? 2 : 1; // supersample factor
  const W = width * ss, H = height * ss;

  const glCanvas = document.createElement('canvas');
  glCanvas.width = W;
  glCanvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const built = buildScene(project, { ground: true });
  const { scene, sun } = built;

  // Sky: vertical gradient on a big inverted sphere, plus hemisphere fill light.
  const skyGeo = new THREE.SphereGeometry(300, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#5f9cf0') }, bottom: { value: new THREE.Color('#e8e2d6') } },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main(){ float h = clamp(normalize(vPos).y, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.6)), 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.add(new THREE.HemisphereLight('#cfe3ff', '#6b5b4a', 0.9));

  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = cam.bottom = -30;
  cam.right = cam.top = 30;
  cam.near = 1;
  cam.far = 150;
  cam.updateProjectionMatrix();

  const c = camera.clone();
  c.aspect = width / height;
  c.updateProjectionMatrix();

  renderer.render(scene, c);

  // Downsample to the requested size.
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(glCanvas, 0, 0, width, height);

  skyGeo.dispose();
  skyMat.dispose();
  built.dispose();
  renderer.dispose();
  return out;
}
