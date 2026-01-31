import { Suspense, useEffect, useRef } from 'react'
import { OrbitControls, Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import Terrain from './Terrain'
import WindField from './WindField'
import { DualPaths } from './FlightPath'
import { DualDrones } from './Drone'
import { useScene } from '../context/SceneContext'
import type { VisibilityState } from './VisibilityToggles'

// ============================================================================
// Types
// ============================================================================

export interface SceneProps {
  /** Visibility settings for scene elements */
  visibility?: VisibilityState
}

// ============================================================================
// Sub-components
// ============================================================================

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

/**
 * Adjusts camera to fit the scene when bounds are loaded.
 */
function CameraController() {
  const { camera } = useThree()
  const { sceneBounds } = useScene()
  const hasAdjusted = useRef(false)

  useEffect(() => {
    if (sceneBounds && !hasAdjusted.current) {
      const { center, size } = sceneBounds
      // Position camera to see the whole scene
      // Distance based on scene size
      const maxDim = Math.max(size[0], size[2])
      const distance = maxDim * 0.8
      const height = Math.max(size[1] * 2, 200)

      camera.position.set(
        center[0] + distance * 0.5,
        height,
        center[2] + distance * 0.5
      )
      camera.lookAt(center[0], center[1], center[2])
      camera.updateProjectionMatrix()
      hasAdjusted.current = true
      console.log('[CameraController] Adjusted camera to scene bounds:', sceneBounds)
    }
  }, [sceneBounds, camera])

  return null
}

// ============================================================================
// Main Component
// ============================================================================

// Default visibility if not provided
const DEFAULT_VISIBILITY: VisibilityState = {
  windField: true,
  naivePath: true,
  optimizedPath: true,
  naiveDrone: true,
  optimizedDrone: true,
  terrain: true,
  waypoints: false,
}

export default function Scene({ visibility = DEFAULT_VISIBILITY }: SceneProps) {
  const { windFieldData, paths, currentFrame, simulation } = useScene()

  // Debug: log when paths change
  if (paths) {
    console.log('[Scene] Paths received:', {
      naive: paths.naive?.length,
      optimized: paths.optimized?.length,
      naiveFirst: paths.naive?.[0],
      naiveLast: paths.naive?.[paths.naive?.length - 1],
      optimizedFirst: paths.optimized?.[0],
      optimizedLast: paths.optimized?.[paths.optimized?.length - 1],
    })
  }

  return (
    <>
      <Lighting />
      <CameraController />

      {/* Terrain (STL model) */}
      {visibility.terrain && (
        <Suspense fallback={<LoadingBox />}>
          <Terrain />
        </Suspense>
      )}

      {/* Wind field visualization */}
      {windFieldData && visibility.windField && (
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
          showNaive={visibility.naivePath}
          showOptimized={visibility.optimizedPath}
          lineWidth={4}
          showWaypoints={visibility.waypoints}
        />
      )}

      {/* Animated drones following their routes */}
      {(simulation.status === 'simulating' || simulation.status === 'complete') && (
        <DualDrones
          naiveFrame={currentFrame.naive}
          optimizedFrame={currentFrame.optimized}
          showNaive={visibility.naiveDrone}
          showOptimized={visibility.optimizedDrone}
          scale={2}
          showTrail={true}
        />
      )}

      {/* Ground grid for reference */}
      <Grid
        position={[0, 0, 0]}
        args={[200, 200]}
        cellSize={20}
        cellThickness={0.5}
        cellColor="#333"
        sectionSize={100}
        sectionThickness={1}
        sectionColor="#555"
        fadeDistance={1500}
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
