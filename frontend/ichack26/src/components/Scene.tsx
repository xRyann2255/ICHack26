import { Suspense } from 'react'
import { OrbitControls, Grid } from '@react-three/drei'
import Terrain from './Terrain'

function LoadingBox() {
  return (
    <mesh>
      <boxGeometry args={[20, 20, 20]} />
      <meshBasicMaterial color="#4a9eff" wireframe />
    </mesh>
  )
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
    </>
  )
}

export default function Scene() {
  return (
    <>
      <Lighting />
      <Suspense fallback={<LoadingBox />}>
        <Terrain />
      </Suspense>

      {/* Ground grid for reference - rotated to XY plane (Z-up) */}
      <Grid
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[100, 100]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#444"
        sectionSize={20}
        sectionThickness={1}
        sectionColor="#888"
        fadeDistance={200}
        infiniteGrid
      />

      {/* Camera controls - Z-up to match backend coordinate system */}
      <OrbitControls
        makeDefault
        minDistance={10}
        maxDistance={2000}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.1}
        up={[0, 0, 1]}
      />
    </>
  )
}
