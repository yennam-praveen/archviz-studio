import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import { useStore } from '../model/store';
import { buildFloorGeometry, buildWallGeometry } from '../model/geometry';
import type { Level } from '../model/types';

function LevelMeshes({ level }: { level: Level }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);

  const walls = useMemo(
    () =>
      level.walls.map((w) => ({
        wall: w,
        geometry: buildWallGeometry(
          w,
          level.openings.filter((o) => o.wallId === w.id),
          level.elevation,
        ),
      })),
    [level.walls, level.openings, level.elevation],
  );

  const floors = useMemo(
    () => level.floors.map((f) => ({ floor: f, geometry: buildFloorGeometry(f.polygon, level.elevation) })),
    [level.floors, level.elevation],
  );

  return (
    <group>
      {walls.map(({ wall, geometry }) => (
        <mesh
          key={wall.id}
          geometry={geometry}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            select({ kind: 'wall', id: wall.id });
          }}
        >
          <meshStandardMaterial
            color={selection.kind === 'wall' && selection.id === wall.id ? '#ffb454' : '#e8e4dc'}
            roughness={0.9}
          />
        </mesh>
      ))}
      {floors.map(({ floor, geometry }) => (
        <mesh key={floor.id} geometry={geometry} receiveShadow>
          <meshStandardMaterial color="#b9b2a6" roughness={0.8} side={2} />
        </mesh>
      ))}
    </group>
  );
}

export function Scene3D() {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);

  return (
    <Canvas
      shadows
      camera={{ position: [12, 9, 12], fov: 45, near: 0.1, far: 200 }}
      onPointerMissed={() => select({ kind: null, id: null })}
    >
      <color attach="background" args={['#1b1e25']} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[10, 15, 8]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <Environment preset="city" />
      {project.levels.map((l) => (
        <LevelMeshes key={l.id} level={l} />
      ))}
      <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={40} blur={2} far={4} />
      <Grid
        args={[60, 60]}
        cellSize={1}
        cellColor="#2e333d"
        sectionSize={5}
        sectionColor="#4a5060"
        fadeDistance={50}
        infiniteGrid
        position={[0, -0.02, 0]}
      />
      <OrbitControls makeDefault target={[4, 1, -3]} maxPolarAngle={Math.PI / 2 - 0.02} />
    </Canvas>
  );
}
