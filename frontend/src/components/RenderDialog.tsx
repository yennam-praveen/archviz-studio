import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { useStore } from '../model/store';
import { buildScene, defaultCamera } from '../model/buildScene';
import { viewRegistry } from './viewRegistry';
import { downloadBlob, safeName } from '../export/download';
import { rasterRender } from '../export/rasterRender';

const RESOLUTIONS: Record<string, number> = { 'Preview 960': 960, 'HD 1280': 1280, 'Full HD 1920': 1920, '4K 3840': 3840 };
type Engine = 'raster' | 'pathtraced';
type Phase = 'idle' | 'building' | 'rendering' | 'done' | 'error';

/** Mean RGB of the path tracer's float target — zero means the driver produced no image. */
function targetMean(pt: WebGLPathTracer, renderer: THREE.WebGLRenderer) {
  const t = pt.target;
  const buf = new Float32Array(t.width * t.height * 4);
  renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
  let s = 0;
  for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2];
  return s / (t.width * t.height);
}

export function RenderDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project);
  const [engine, setEngine] = useState<Engine>('raster');
  const [width, setWidth] = useState(1920);
  const [targetSamples, setTargetSamples] = useState(200);
  const [samples, setSamples] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef(false);

  const stop = () => { stopRef.current = true; };
  useEffect(() => () => stop(), []);

  const cameraFor = (w: number, h: number) => {
    // Use the architect's current viewpoint; fall back to an automatic framing if the view isn't mounted.
    const cam = viewRegistry.camera ? viewRegistry.camera.clone() : defaultCamera(project, w / h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    return cam;
  };

  const runRaster = (w: number, h: number) => {
    setPhase('building');
    const cam = cameraFor(w, h);
    if (import.meta.env.DEV) (window as unknown as { __lastRenderCamera: unknown }).__lastRenderCamera = cam;
    const canvas = rasterRender(project, cam, w, h);
    canvasRef.current = canvas;
    setPreview(canvas.toDataURL('image/png'));
    setSamples(targetSamples);
    setMessage('Rasterized render finished.');
    setPhase('done');
  };

  const runPathTraced = async (w: number, h: number) => {
    setPhase('building');
    setMessage('Building scene and compiling the path-tracing shader — the first run can take 1–3 minutes on laptop GPUs.');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const built = buildScene(project, { ground: true });
    // Sky dome: bright blue overhead, warm grey horizon. Lights the scene softly in addition to the sun.
    const sky = new GradientEquirectTexture(512);
    sky.topColor.set('#7fb2ff');
    sky.bottomColor.set('#e4dccd');
    sky.exponent = 1.5;
    sky.update();
    built.scene.environment = sky;
    built.scene.background = sky;
    built.scene.environmentIntensity = 0.9;

    const camera = cameraFor(w, h);
    const pt = new WebGLPathTracer(renderer);
    pt.bounces = 6;
    pt.filterGlossyFactor = 0.5;
    pt.tiles.set(3, 3);
    pt.dynamicLowRes = false;
    pt.rasterizeScene = false;
    pt.renderToCanvas = true;
    pt.multipleImportanceSampling = true;
    pt.minSamples = 1;
    pt.fadeDuration = 0;
    pt.renderDelay = 0;

    if (import.meta.env.DEV) {
      (window as unknown as { __archvizRender: unknown }).__archvizRender = { pt, renderer, canvas, scene: built.scene, camera };
    }

    let fellBack = false;
    try {
      await Promise.resolve();
      pt.setScene(built.scene, camera); // synchronous BVH build: a building is a few thousand triangles
      setPhase('rendering');
      let n = 0;
      let lastPreview = 0;
      let checked = false;
      await new Promise<void>((resolve) => {
        const loop = () => {
          if (stopRef.current || n >= targetSamples) { resolve(); return; }
          // One full sample per tick (renderSample draws a single tile of the 3×3 grid).
          for (let i = 0; i < 9; i++) pt.renderSample();
          n = Math.floor(pt.samples);
          setSamples(n);
          if ((pt as unknown as { isCompiling: boolean }).isCompiling) setMessage('Compiling path-tracing shader…');
          else setMessage(`Sample ${n} / ${targetSamples} — the image refines progressively; stop any time.`);
          // Some drivers (notably Intel via ANGLE/Direct3D) miscompile the shader and output pure black.
          if (!checked && n >= 8) {
            checked = true;
            if (targetMean(pt, renderer) === 0) { fellBack = true; resolve(); return; }
          }
          if (performance.now() - lastPreview > 400) {
            lastPreview = performance.now();
            setPreview(canvas.toDataURL('image/jpeg', 0.8));
          }
          // rAF pauses in background tabs; keep rendering there with a timer instead.
          if (document.hidden) setTimeout(loop, 0);
          else requestAnimationFrame(loop);
        };
        loop();
      });
      if (fellBack) {
        setMessage('This GPU driver cannot run the path tracer (black output) — switched to the rasterized engine.');
        setEngine('raster');
        runRaster(w, h);
        return;
      }
      setPreview(canvas.toDataURL('image/png'));
      setMessage(`Finished: ${Math.floor(pt.samples)} samples.`);
      setPhase('done');
    } catch (e) {
      setMessage(String(e));
      setPhase('error');
    } finally {
      pt.dispose();
      built.dispose();
      sky.dispose();
      renderer.dispose();
    }
  };

  const start = async () => {
    stopRef.current = false;
    setSamples(0);
    setPreview(null);
    setMessage('');
    // Always a 16:9 frame: the 3D pane's own aspect depends on window layout and is often portrait.
    const h = Math.round((width * 9) / 16);
    try {
      if (engine === 'raster') runRaster(width, h);
      else await runPathTraced(width, h);
    } catch (e) {
      setMessage(String(e));
      setPhase('error');
    }
  };

  const save = () => {
    canvasRef.current?.toBlob((b) => b && downloadBlob(b, `${safeName(project.name)}_render.png`, 'image/png'), 'image/png');
  };

  const busy = phase === 'building' || phase === 'rendering';

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Render image</strong>
          <span className="hint">From the current 3D viewpoint.</span>
          <span className="spacer" />
          <button onClick={() => { stop(); onClose(); }}>Close</button>
        </div>
        <div className="row">
          <label className="field">
            <span>Engine</span>
            <select value={engine} disabled={busy} onChange={(e) => setEngine(e.target.value as Engine)}>
              <option value="raster">Fast — rasterized (any GPU, ~1 s)</option>
              <option value="pathtraced">Photoreal — path traced (desktop GPU, minutes)</option>
            </select>
          </label>
          <label className="field">
            <span>Resolution</span>
            <select value={width} disabled={busy} onChange={(e) => setWidth(+e.target.value)}>
              {Object.entries(RESOLUTIONS).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
            </select>
          </label>
          {engine === 'pathtraced' && (
            <label className="field">
              <span>Samples (quality)</span>
              <select value={targetSamples} disabled={busy} onChange={(e) => setTargetSamples(+e.target.value)}>
                <option value={50}>50 – quick</option>
                <option value={200}>200 – good</option>
                <option value={600}>600 – clean</option>
                <option value={1500}>1500 – final</option>
              </select>
            </label>
          )}
          {!busy && <button className="primary" onClick={start}>{phase === 'done' ? 'Render again' : 'Start render'}</button>}
          {busy && engine === 'pathtraced' && <button onClick={stop}>Stop</button>}
          {phase === 'done' && <button className="primary" onClick={save}>Save PNG</button>}
        </div>
        {engine === 'pathtraced' && (
          <div className="progress">
            <div style={{ width: `${Math.min(100, (samples / targetSamples) * 100)}%` }} />
          </div>
        )}
        <p className={phase === 'error' ? 'warn' : 'hint'}>
          {phase === 'idle' ? 'Orbit the 3D view to frame the shot, then start.' : message}
        </p>
        {preview && <img className="render-preview" src={preview} alt="render" />}
      </div>
    </div>
  );
}
