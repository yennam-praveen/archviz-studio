import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  createXRStore, XR, XRDomOverlay, XRSpace, useXR, useXRAnchor, useXRHitTest, useXRInputSourceEvent,
} from '@react-three/xr';
import type { Project } from '../model/types';
import { buildScene } from '../model/buildScene';
import { levelBounds } from '../model/geometry';

/**
 * Phone AR viewer (Android Chrome, WebXR). Two modes:
 *  - Tabletop: scale model placed on a table/floor — reliable, great for client meetings.
 *  - On-site: 1:1 placed on the actual plot. Tracking drifts over minutes; tap again to re-anchor.
 * Everything is anchored with a WebXR anchor so the model holds its place as the phone moves.
 */

type Mode = 'tabletop' | 'site';
const TABLETOP_SCALES = [200, 100, 50, 20];

const store = createXRStore({
  hitTest: true,
  anchors: true,
  domOverlay: true,
  // Phone AR has no controllers/hands; keep the scene clean and the session request minimal.
  controller: false,
  hand: false,
  emulate: false,
});

function Building({ project }: { project: Project }) {
  const built = useMemo(() => buildScene(project), [project]);
  useEffect(() => () => built.dispose(), [built]);
  // Centre the footprint on the anchor point so the model sits where the user tapped.
  const offset = useMemo(() => {
    const b = levelBounds(project.levels[0]);
    return b ? new THREE.Vector3(-(b.x0 + b.x1) / 2, 0, (b.y0 + b.y1) / 2) : new THREE.Vector3();
  }, [project]);
  return <primitive object={built.building} position={offset} />;
}

function Reticle({ hitRef, visible }: { hitRef: React.MutableRefObject<XRHitTestResult | null>; visible: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const [hasHit, setHasHit] = useState(false);
  useXRHitTest((results, getWorldMatrix) => {
    if (results.length > 0 && ref.current) {
      getWorldMatrix(matrix, results[0]);
      matrix.decompose(ref.current.position, ref.current.quaternion, ref.current.scale);
      hitRef.current = results[0];
      if (!hasHit) setHasHit(true);
    } else {
      hitRef.current = null;
      if (hasHit) setHasHit(false);
    }
  }, 'viewer');
  useFrame(({ clock }) => {
    if (ref.current) ref.current.children[0].rotation.z = clock.elapsedTime * 1.5;
  });
  return (
    <group ref={ref} visible={visible && hasHit}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.06, 0.08, 48]} />
        <meshBasicMaterial color="#ffb454" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.01, 16]} />
        <meshBasicMaterial color="#ffb454" />
      </mesh>
    </group>
  );
}

function ARScene({ project, mode, scale, rotation, onPlaced, replaceRequest }: {
  project: Project; mode: Mode; scale: number; rotation: number; onPlaced(): void; replaceRequest: number;
}) {
  const hitRef = useRef<XRHitTestResult | null>(null);
  const [anchor, createAnchor] = useXRAnchor();
  const [placing, setPlacing] = useState(true);
  const inSession = useXR((s) => !!s.session);

  useEffect(() => { setPlacing(true); }, [replaceRequest, mode]);

  useXRInputSourceEvent('all', 'select', () => {
    if (!placing || !hitRef.current) return;
    void createAnchor({ relativeTo: 'hit-test-result', hitTestResult: hitRef.current }).then((a) => {
      if (a) { setPlacing(false); onPlaced(); }
    });
  }, [placing, createAnchor, onPlaced]);

  const factor = mode === 'site' ? 1 : 1 / scale;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 8, 4]} intensity={1.6} castShadow={false} />
      <hemisphereLight args={['#dfe9ff', '#6b5b4a', 0.5]} />
      {inSession && <Reticle hitRef={hitRef} visible={placing} />}
      {anchor && !placing && (
        <XRSpace space={anchor.anchorSpace}>
          <group rotation-y={(rotation * Math.PI) / 180} scale={factor}>
            <Building project={project} />
          </group>
        </XRSpace>
      )}
    </>
  );
}

/** Plain 3D preview for browsers without WebXR (iPhone, desktop) so the share link still works. */
function FallbackPreview({ project }: { project: Project }) {
  const b = levelBounds(project.levels[0]);
  const target: [number, number, number] = b ? [(b.x0 + b.x1) / 2, 1, -(b.y0 + b.y1) / 2] : [0, 1, 0];
  return (
    <Canvas camera={{ position: [target[0] + 12, 9, target[2] + 12], fov: 45 }}>
      <color attach="background" args={['#1b1e25']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} />
      <hemisphereLight args={['#dfe9ff', '#6b5b4a', 0.5]} />
      <group position={b ? [(b.x0 + b.x1) / 2, 0, -(b.y0 + b.y1) / 2] : [0, 0, 0]}>
        <Building project={project} />
      </group>
      <gridHelper args={[40, 40, '#3a4150', '#262b35']} position={[target[0], 0, target[2]]} />
      <OrbitControls target={target} />
    </Canvas>
  );
}

export function ARView({ project }: { project: Project }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('tabletop');
  const [scale, setScale] = useState(50);
  const [rotation, setRotation] = useState(0);
  const [placed, setPlaced] = useState(false);
  const [replaceRequest, setReplaceRequest] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) { setSupported(false); return; }
    xr.isSessionSupported('immersive-ar').then(setSupported).catch(() => setSupported(false));
  }, []);

  const enter = async () => {
    setError('');
    setPlaced(false);
    try {
      const session = await store.enterAR();
      if (!session) setError('Could not start AR. Use Chrome on Android and allow camera access.');
    } catch (e) {
      setError(String(e));
    }
  };

  const replace = () => { setPlaced(false); setReplaceRequest((n) => n + 1); };

  const controls = (
    <div className="ar-controls">
      <div className="row">
        <button className={mode === 'tabletop' ? 'active' : ''} onClick={() => { setMode('tabletop'); replace(); }}>Tabletop</button>
        <button className={mode === 'site' ? 'active' : ''} onClick={() => { setMode('site'); replace(); }}>On-site 1:1</button>
        {mode === 'tabletop' && (
          <select value={scale} onChange={(e) => setScale(+e.target.value)}>
            {TABLETOP_SCALES.map((s) => <option key={s} value={s}>1:{s}</option>)}
          </select>
        )}
      </div>
      <div className="row">
        <button onClick={() => setRotation((r) => r - 15)}>⟲ 15°</button>
        <button onClick={() => setRotation((r) => r + 15)}>⟳ 15°</button>
        <button onClick={replace}>Re-place</button>
        <button className="danger" onClick={() => store.getState().session?.end()}>Exit AR</button>
      </div>
      <p className="hint">
        {placed
          ? mode === 'site'
            ? 'Walk through the building. If it drifts, tap Re-place and tap the ground again.'
            : 'Walk around the model. Use the scale menu or rotate buttons to adjust.'
          : 'Move the phone slowly over a flat surface until the ring appears, then tap to place.'}
      </p>
    </div>
  );

  return (
    <div className="ar-page">
      <header className="bar">
        <strong>ArchViz Studio</strong>
        <span className="name-static">{project.name}</span>
        <span className="spacer" />
        {supported && <button className="primary" onClick={enter}>Start AR</button>}
      </header>
      {supported === false && (
        <p className="ar-note">
          AR needs Chrome on Android (WebXR). Showing a 3D preview instead — on iPhone, ask for the .usdz export to view in AR Quick Look.
        </p>
      )}
      {error && <p className="ar-note warn">{error}</p>}
      <div className="ar-canvas">
        {supported ? (
          <Canvas>
            <XR store={store}>
              <ARScene project={project} mode={mode} scale={scale} rotation={rotation} onPlaced={() => setPlaced(true)} replaceRequest={replaceRequest} />
              <XRDomOverlay>{controls}</XRDomOverlay>
            </XR>
          </Canvas>
        ) : (
          <FallbackPreview project={project} />
        )}
      </div>
      {supported && (
        <p className="ar-note">
          Tap <b>Start AR</b>, point the camera at a table (tabletop) or the ground on site (1:1), wait for the ring, tap to place.
        </p>
      )}
    </div>
  );
}
