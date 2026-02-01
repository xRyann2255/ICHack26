/**
 * Route Creation View Component
 *
 * Phase 1: Shows routes being created with camera following the path.
 */

import { Suspense, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, Grid } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain'
import WindField from './WindField'
import AnimatedPath from './AnimatedPath'
import { useScene } from '../context/SceneContext'

// ============================================================================
// Types
// ============================================================================

export interface RouteCreationViewProps {
  /** Progress 0-1 for path animation */
  progress: number
  /** Which route is currently being shown */
  currentRoute: 'naive' | 'optimized'
  /** Show wind field */
  showWindField?: boolean
}

// ============================================================================
// Loading Fallback
// ============================================================================

function LoadingBox() {
  return (
    <mesh>
      <boxGeometry args={[20, 20, 20]} />
      <meshBasicMaterial color="#4a9eff" wireframe />
    </mesh>
  )
}

// ============================================================================
// Lighting
// ============================================================================

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[100, 200, 100]}
        intensity={1}
        castShadow
      />
    </>
  )
}

// ============================================================================
// Path-Following Camera (with smooth interpolation)
// ============================================================================

interface PathFollowingCameraProps {
  path: [number, number, number][]
  progress: number
  active: boolean
}

// Helper: Get interpolated point along path
function getInterpolatedPoint(
  pathVectors: THREE.Vector3[],
  progress: number,
  outPoint: THREE.Vector3
): void {
  if (pathVectors.length === 0) return
  if (pathVectors.length === 1) {
    outPoint.copy(pathVectors[0])
    return
  }

  const t = Math.max(0, Math.min(1, progress))
  const totalSegments = pathVectors.length - 1
  const exactIndex = t * totalSegments
  const segmentIndex = Math.floor(exactIndex)
  const segmentT = exactIndex - segmentIndex

  if (segmentIndex >= totalSegments) {
    outPoint.copy(pathVectors[pathVectors.length - 1])
    return
  }

  outPoint.lerpVectors(pathVectors[segmentIndex], pathVectors[segmentIndex + 1], segmentT)
}

// Helper: Get smooth direction along path using multiple samples
function getSmoothDirection(
  pathVectors: THREE.Vector3[],
  progress: number,
  lookAheadAmount: number,
  outDir: THREE.Vector3
): void {
  const currentPoint = new THREE.Vector3()
  const aheadPoint = new THREE.Vector3()

  getInterpolatedPoint(pathVectors, progress, currentPoint)
  getInterpolatedPoint(pathVectors, Math.min(1, progress + lookAheadAmount), aheadPoint)

  outDir.subVectors(aheadPoint, currentPoint)
  if (outDir.length() > 0.001) {
    outDir.normalize()
  } else {
    outDir.set(1, 0, 0) // Default direction
  }
}

function PathFollowingCamera({ path, progress, active }: PathFollowingCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const currentPosRef = useRef(new THREE.Vector3(300, 200, 300))
  const currentLookRef = useRef(new THREE.Vector3(0, 50, 0))
  const targetPosRef = useRef(new THREE.Vector3())
  const targetLookRef = useRef(new THREE.Vector3())
  const currentPointRef = useRef(new THREE.Vector3())
  const directionRef = useRef(new THREE.Vector3())

  // Convert path to Vector3 array
  const pathVectors = useMemo(() =>
    path.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    [path]
  )

  useFrame((_, delta) => {
    if (!cameraRef.current || !active || pathVectors.length < 2) return

    // Get current interpolated point along path
    getInterpolatedPoint(pathVectors, progress, currentPointRef.current)

    // Get smooth direction of travel
    getSmoothDirection(pathVectors, progress, 0.05, directionRef.current)

    // Camera offset: behind and above the current point
    targetPosRef.current.copy(directionRef.current).multiplyScalar(-60)
    targetPosRef.current.y = 40
    targetPosRef.current.add(currentPointRef.current)

    // Look ahead along the path
    getInterpolatedPoint(
      pathVectors,
      Math.min(1, progress + 0.08),
      targetLookRef.current
    )

    // Smooth interpolation with frame-rate independent lerp
    const lerpFactor = Math.min(1, delta * 3)
    currentPosRef.current.lerp(targetPosRef.current, lerpFactor)
    currentLookRef.current.lerp(targetLookRef.current, lerpFactor)

    // Apply to camera
    cameraRef.current.position.copy(currentPosRef.current)
    cameraRef.current.lookAt(currentLookRef.current)
  })

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault={active}
      fov={60}
      near={0.1}
      far={5000}
      position={[300, 200, 300]}
    />
  )
}

// ============================================================================
// Scene Content
// ============================================================================

interface SceneContentProps {
  progress: number
  currentRoute: 'naive' | 'optimized'
  showWindField: boolean
}

function SceneContent({ progress, currentRoute, showWindField }: SceneContentProps) {
  const { windFieldData, paths } = useScene()

  // Get path for current route
  const path = currentRoute === 'naive' ? paths?.naive : paths?.optimized
  const pathColor = currentRoute === 'naive' ? '#ff6b6b' : '#4ecdc4'

  // Also show completed path if we're on optimized route
  const showNaivePath = currentRoute === 'optimized' && paths?.naive

  return (
    <>
      <Lighting />

      <Suspense fallback={<LoadingBox />}>
        <Terrain />
      </Suspense>

      {/* Wind field (dimmed during route creation) */}
      {showWindField && windFieldData && (
        <WindField
          data={windFieldData}
          visible={true}
          streamlineCount={400}
          integrationSteps={18}
          stepSize={8.0}
          arrowSize={3.5}
        />
      )}

      {/* Previously completed naive path (shown dimmed when drawing optimized) */}
      {showNaivePath && (
        <AnimatedPath
          path={paths.naive!}
          progress={1}
          color="#ff6b6b"
          lineWidth={2}
          showExplorationPoint={false}
        />
      )}

      {/* Currently animating path */}
      {path && (
        <>
          <AnimatedPath
            path={path}
            progress={progress}
            color={pathColor}
            lineWidth={4}
            showExplorationPoint={true}
            explorationColor={pathColor}
          />
          <PathFollowingCamera
            path={path}
            progress={progress}
            active={true}
          />
        </>
      )}

      {/* Ground grid */}
      <Grid
        position={[0, 0, 0]}
        args={[100, 100]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#333"
        sectionSize={20}
        sectionThickness={1}
        sectionColor="#555"
        fadeDistance={200}
        infiniteGrid
      />
    </>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function RouteCreationView({
  progress,
  currentRoute,
  showWindField = true,
}: RouteCreationViewProps) {
  const routeLabel = currentRoute === 'naive'
    ? 'Computing Naive Route...'
    : 'Computing Wind-Optimized Route...'
  const accentColor = currentRoute === 'naive' ? '#ff6b6b' : '#4ecdc4'

  return (
    <div style={styles.container}>
      {/* Route label */}
      <div style={{ ...styles.label, backgroundColor: accentColor }}>
        {routeLabel}
      </div>

      {/* Progress indicator */}
      <div style={styles.progressContainer}>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progress * 100}%`,
              backgroundColor: accentColor,
            }}
          />
        </div>
        <span style={styles.progressText}>{Math.round(progress * 100)}%</span>
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{
          position: [300, 200, 300],
          fov: 60,
          near: 0.1,
          far: 5000,
        }}
        shadows
        style={{ background: '#1a1a2e' }}>
        <color attach="background" args={['#1a1a2e']} />
        <fog attach="fog" args={['#1a1a2e', 300, 1500]} />
        <SceneContent
          progress={progress}
          currentRoute={currentRoute}
          showWindField={showWindField}
        />
      </Canvas>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  label: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 28px',
    borderRadius: 25,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 16,
    fontWeight: 600,
    zIndex: 100,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    letterSpacing: '0.5px',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 30,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 20px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    zIndex: 100,
  },
  progressBar: {
    width: 200,
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.1s ease-out',
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'monospace',
    minWidth: 45,
  },
}
