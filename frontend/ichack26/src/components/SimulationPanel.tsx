/**
 * Simulation Panel Component
 *
 * A single 3D view panel showing one route (naive or optimized).
 * Used in side-by-side comparison layout.
 */

import { Suspense, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain'
import WindField from './WindField'
import FlightPath from './FlightPath'
import Drone from './Drone'
import { useScene } from '../context/SceneContext'

// ============================================================================
// Types
// ============================================================================

export interface SimulationPanelProps {
  /** Which route to display */
  routeType: 'naive' | 'optimized'
  /** Panel label */
  label: string
  /** Label color */
  labelColor: string
  /** Whether to show wind field */
  showWindField?: boolean
  /** Whether to show terrain */
  showTerrain?: boolean
  /** Whether to show waypoints */
  showWaypoints?: boolean
  /** Camera ref for syncing between panels */
  cameraRef?: React.MutableRefObject<THREE.Camera | null>
  /** Whether this panel controls camera sync */
  isControlPanel?: boolean
  /** Callback when camera changes (for syncing) */
  onCameraChange?: (camera: THREE.Camera) => void
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
      <directionalLight
        position={[100, 200, 100]}
        intensity={1.5}
        color="#fffaf0"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
    </>
  )
}

// ============================================================================
// Scene Content
// ============================================================================

interface SceneContentProps {
  routeType: 'naive' | 'optimized'
  showWindField: boolean
  showTerrain: boolean
  showWaypoints: boolean
}

function SceneContent({ routeType, showWindField, showTerrain, showWaypoints }: SceneContentProps) {
  const { windFieldData, paths, currentFrame, simulation } = useScene()

  // Get the appropriate path and frame for this route
  const path = routeType === 'naive' ? paths?.naive : paths?.optimized
  const frame = routeType === 'naive' ? currentFrame.naive : currentFrame.optimized

  // Path color based on route type
  const pathColor = routeType === 'naive' ? '#ff6b6b' : '#4ecdc4'
  const droneColor = routeType === 'naive' ? '#ff6b6b' : '#4ecdc4'

  return (
    <>
      <Environment
        files="/hdri/sky.hdr"
        background
        backgroundIntensity={1}
        environmentIntensity={0.8}
      />
      <Lighting />

      {/* Terrain */}
      {showTerrain && (
        <Suspense fallback={<LoadingBox />}>
          <Terrain />
        </Suspense>
      )}

      {/* Wind field visualization */}
      {showWindField && windFieldData && (
        <WindField
          data={windFieldData}
          visible={true}
          streamlineCount={550}
          integrationSteps={22}
          stepSize={7.0}
          arrowSize={4.0}
        />
      )}

      {/* Flight path for this route only */}
      {path && (
        <FlightPath
          path={path}
          color={pathColor}
          lineWidth={4}
          showWaypoints={showWaypoints}
          dashed={routeType === 'naive'}
          dashScale={2}
        />
      )}

      {/* Drone for this route only */}
      {(simulation.status === 'simulating' || simulation.status === 'complete') && frame && (
        <Drone
          frame={frame}
          color={droneColor}
          scale={2}
          showTrail={true}
          showEffort={true}
          showWind={true}
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
    </>
  )
}

// ============================================================================
// Camera Sync Controls
// ============================================================================

interface SyncedControlsProps {
  isControlPanel: boolean
  onCameraChange?: (camera: THREE.Camera) => void
  targetCamera?: THREE.Camera | null
}

function SyncedControls({ isControlPanel, onCameraChange, targetCamera }: SyncedControlsProps) {
  const controlsRef = useRef<any>(null)

  // Sync camera position from target (if not control panel)
  useEffect(() => {
    if (!isControlPanel && targetCamera && controlsRef.current) {
      const controls = controlsRef.current
      const camera = controls.object as THREE.Camera

      // Copy position and rotation from target
      camera.position.copy(targetCamera.position)
      camera.rotation.copy(targetCamera.rotation)
      controls.target.copy((targetCamera as any).userData?.target || new THREE.Vector3(0, 0, 0))
      controls.update()
    }
  }, [isControlPanel, targetCamera])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={10}
      maxDistance={2000}
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 2.1}
      onChange={(e) => {
        if (isControlPanel && onCameraChange && e?.target) {
          const camera = e.target.object as THREE.Camera
            // Store target for syncing
            ; (camera as any).userData = { target: e.target.target.clone() }
          onCameraChange(camera)
        }
      }}
    />
  )
}

// ============================================================================
// Main Panel Component
// ============================================================================

export default function SimulationPanel({
  routeType,
  label,
  labelColor,
  showWindField = true,
  showTerrain = true,
  showWaypoints = false,
  cameraRef,
  isControlPanel = false,
  onCameraChange,
}: SimulationPanelProps) {
  return (
    <div style={styles.panel}>
      {/* Panel label */}
      <div style={{ ...styles.label, backgroundColor: labelColor }}>
        {label}
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
      >

        <SceneContent
          routeType={routeType}
          showWindField={showWindField}
          showTerrain={showTerrain}
          showWaypoints={showWaypoints}
        />

        <SyncedControls
          isControlPanel={isControlPanel}
          onCameraChange={onCameraChange}
          targetCamera={cameraRef?.current}
        />
      </Canvas>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'relative',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 20px',
    borderRadius: 20,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    zIndex: 100,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
  },
}
