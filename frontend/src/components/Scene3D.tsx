import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Sky, PointerLockControls } from '@react-three/drei';
import { EffectComposer, N8AO, Vignette, SMAA } from '@react-three/postprocessing';
import { useStore } from '../model/store';
import { buildFloorGeometry, buildRoofGeometry, buildWallGeometry, levelBounds } from '../model/geometry';
import { DEFAULT_FLOOR_MATERIAL, DEFAULT_WALL_MATERIAL, preset } from '../model/materials';
import { sunDirection, sunPosition } from '../model/sun';
import type { Level } from '../model/types';
import { viewRegistry } from './viewRegistry';

function LevelMeshes({ level, active }: { level: Level; active: boolean }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const setActiveLevel = useStore((s) => s.setActiveLevel);

  const walls = useMemo(
    () =>
      level.walls.map((w) => ({
        wall: w,
        geometry: buildWallGeometry(w, level.openings.filter((o) => o.wallId === w.id), level.elevation),
      })),
    [level.walls, level.openings, level.elevation],
  );
  const floors = useMemo(
    () => level.floors.map((f) => ({ floor: f, geometry: buildFloorGeometry(f.polygon, level.elevation) })),
    [level.floors, level.elevation],
  );
  const roof = useMemo(() => (level.roof ? buildRoofGeometry(level, level.roof) : null), [level]);

  return (
    <group>
      {walls.map(({ wall, geometry }) => {
        const m = preset(wall.material, DEFAULT_WALL_MATERIAL);
        const selected = active && selection.kind === 'wall' && selection.id === wall.id;
        return (
          <mesh
            key={wall.id}
            geometry={geometry}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              if (!active) setActiveLevel(level.id);
              select({ kind: 'wall', id: wall.id });
            }}
          >
            <meshStandardMaterial
              color={m.color}
              roughness={m.roughness}
              metalness={m.metalness}
              emissive={selected ? '#ffb454' : '#000000'}
              emissiveIntensity={selected ? 0.35 : 0}
            />
          </mesh>
        );
      })}
      {floors.map(({ floor, geometry }) => {
        const m = preset(floor.material, DEFAULT_FLOOR_MATERIAL);
        return (
          <mesh key={floor.id} geometry={geometry} receiveShadow>
            <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {roof && level.roof && (
        <mesh geometry={roof} castShadow receiveShadow>
          <meshStandardMaterial
            color={preset(level.roof.material, 'roof_tile').color}
            roughness={preset(level.roof.material, 'roof_tile').roughness}
            metalness={preset(level.roof.material, 'roof_tile').metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

function SunLight() {
  const sun = useStore((s) => s.project.sun);
  const dir = useMemo(() => sunDirection(sun, 60), [sun]);
  const { elevation } = sunPosition(sun);
  const daylight = THREE.MathUtils.clamp(elevation / 15, 0, 1); // fade at dawn/dusk
  return (
    <>
      <directionalLight
        position={dir}
        intensity={0.5 + 2.5 * daylight}
        color={daylight < 0.5 ? '#ffc9a0' : '#fff4e6'}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={1}
        shadow-camera-far={150}
      />
      <hemisphereLight args={['#cfe3ff', '#5a4a3a', 0.35 + 0.35 * daylight]} />
      <Sky sunPosition={dir} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />
    </>
  );
}

/** WASD + mouse-look at eye height. Esc releases the pointer. No collision (phase 3). */
function WalkControls() {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const active = useStore((s) => s.activeLevelId);
  const project = useStore((s) => s.project);
  const vel = useRef(new THREE.Vector3());

  useEffect(() => {
    const level = project.levels.find((l) => l.id === active)!;
    const b = levelBounds(level);
    const eye = level.elevation + 1.6;
    camera.position.set(b ? (b.x0 + b.x1) / 2 : 0, eye, b ? -(b.y0 + b.y1) / 2 : 0);
    camera.lookAt(camera.position.x + 1, eye, camera.position.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.ShiftLeft ? 4 : 1.8) * Math.min(dt, 0.05);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    vel.current.set(0, 0, 0);
    if (k.KeyW || k.ArrowUp) vel.current.add(fwd);
    if (k.KeyS || k.ArrowDown) vel.current.sub(fwd);
    if (k.KeyD || k.ArrowRight) vel.current.add(right);
    if (k.KeyA || k.ArrowLeft) vel.current.sub(right);
    if (vel.current.lengthSq() > 0) camera.position.addScaledVector(vel.current.normalize(), speed);
  });

  return <PointerLockControls domElement={gl.domElement} />;
}

/** Publishes the viewport camera for the render dialog / exporters. */
function CameraRegistrar() {
  const { camera, size } = useThree();
  useEffect(() => {
    viewRegistry.camera = camera as THREE.PerspectiveCamera;
    viewRegistry.aspect = size.width / Math.max(1, size.height);
    return () => {
      viewRegistry.camera = null;
    };
  }, [camera, size]);
  return null;
}

function OrbitSetup() {
  const project = useStore((s) => s.project);
  const target = useMemo<[number, number, number]>(() => {
    const b = levelBounds(project.levels[0]);
    return b ? [(b.x0 + b.x1) / 2, 1, -(b.y0 + b.y1) / 2] : [0, 1, 0];
  }, [project.levels]);
  return <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} />;
}

export function Scene3D() {
  const project = useStore((s) => s.project);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const select = useStore((s) => s.select);
  const viewMode = useStore((s) => s.viewMode);

  return (
    <Canvas
      shadows
      gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      camera={{ position: [14, 10, 14], fov: 45, near: 0.05, far: 500 }}
      onPointerMissed={() => select({ kind: null, id: null })}
    >
      <SunLight />
      <Environment preset="city" environmentIntensity={0.25} />
      {project.levels.map((l) => (
        <LevelMeshes key={l.id} level={l} active={l.id === activeLevelId} />
      ))}
      {/* Ground plane: catches shadows so the sun study reads clearly. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#6e7a5c" roughness={1} />
      </mesh>
      <Grid
        args={[60, 60]}
        cellSize={1}
        cellColor="#5a6a4a"
        sectionSize={5}
        sectionColor="#3f4d36"
        fadeDistance={40}
        infiniteGrid
        position={[0, 0.005, 0]}
      />
      <CameraRegistrar />
      {viewMode === 'walk' ? <WalkControls /> : <OrbitSetup />}
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={0.6} intensity={2} distanceFalloff={1} quality="medium" />
        <SMAA />
        <Vignette eskil={false} offset={0.2} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  );
}
