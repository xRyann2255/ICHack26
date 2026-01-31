import { Suspense } from 'react'
import { OrbitControls, Grid } from '@react-three/drei'
import Terrain from './Terrain'
import WindField from './WindField'
import { DualPaths } from './FlightPath'
import { useScene } from '../context/SceneContext'

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
        position={[100, 200, 100]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
    </>
  )
}

export default function Scene() {
  const { windFieldData, paths } = useScene()

  return (
    <>
      <Lighting />
      <Suspense fallback={<LoadingBox />}>
        <Terrain />
      </Suspense>

      {/* Wind field visualization */}
      {windFieldData && (
        <WindField
          data={windFieldData}
          visible={true}
          colorMode="speed"
          arrowScale={2.0}
          opacity={0.8}
          displayDownsample={2}
        />
      )}

      {/* Flight paths */}
      {paths && (
        <DualPaths
          naivePath={paths.naive}
          optimizedPath={paths.optimized}
          showNaive={true}
          showOptimized={true}
          lineWidth={4}
          showWaypoints={false}
        />
      )}

      {/* Ground grid for reference */}
      <Grid
        position={[0, 0, 0]}
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

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        minDistance={10}
        maxDistance={2000}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  )
}
