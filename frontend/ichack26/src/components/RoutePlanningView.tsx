/**
 * Route Planning View Component
 *
 * Allows users to interactively select start and end points for drone routes
 * by clicking on the 3D terrain.
 */

import { useRef, useCallback, Suspense, useState, useEffect, useMemo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Html } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain'
import WindField from './WindField'
import { useScene } from '../context/SceneContext'

// Note: THREE is used for type annotations in click handlers

// ============================================================================
// Types
// ============================================================================

interface RoutePlanningViewProps {
  showWindField?: boolean
}

interface MarkerProps {
  position: [number, number, number]
  color: string
  label: string
  pulseColor: string
  buildings?: { min: [number, number, number]; max: [number, number, number] }[]
}

// ============================================================================
// Marker Component
// ============================================================================

function Marker({ position, color, label, pulseColor, buildings = [] }: MarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  // Calculate ground level based on buildings under this position
  // Coordinate system: API uses [x, y, z] where x=east, y=north, z=altitude
  // Three.js uses [x, y, z] where x=east, y=up, z=north
  // position is stored as [API_x, API_y, API_z] = [Three.js_x, Three.js_z, altitude]
  const groundLevel = useMemo(() => {
    const apiX = position[0]  // East-west (Three.js X)
    const apiY = position[1]  // North-south (Three.js Z)
    let maxHeight = 0

    for (const building of buildings) {
      // Check if position is within building footprint (API X and Y axes)
      if (
        apiX >= building.min[0] && apiX <= building.max[0] &&  // X bounds (east-west)
        apiY >= building.min[1] && apiY <= building.max[1]     // Y bounds (north-south)
      ) {
        // Building height is on API Z axis (altitude) = building.max[2]
        maxHeight = Math.max(maxHeight, building.max[2])
      }
    }

    return maxHeight
  }, [position, buildings])

  const markerHeight = 20 // Height above ground level

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation above ground level
      meshRef.current.position.y = groundLevel + markerHeight + Math.sin(state.clock.elapsedTime * 2) * 2
    }
  })

  return (
    <group position={[position[0], 0, position[1]]}>
      {/* Ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundLevel + 1, 0]}>
        <ringGeometry args={[8, 12, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>

      {/* Pulsing outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundLevel + 0.5, 0]}>
        <ringGeometry args={[12, 14, 32]} />
        <meshBasicMaterial color={pulseColor} transparent opacity={0.3} />
      </mesh>

      {/* Short vertical beam */}
      <mesh position={[0, groundLevel + markerHeight / 2, 0]}>
        <cylinderGeometry args={[1, 1, markerHeight, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>

      {/* Floating marker above ground level */}
      <mesh
        ref={meshRef}
        position={[0, groundLevel + markerHeight, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[6, 16, 16]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Label */}
      <Html
        position={[0, groundLevel + markerHeight + 20, 0]}
        center
        style={{
          color: '#fff',
          fontSize: '14px',
          fontWeight: 'bold',
          fontFamily: 'system-ui, sans-serif',
          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Html>
    </group>
  )
}

// ============================================================================
// Click Handler Component
// ============================================================================

function ClickablePlane() {
  const { sceneBounds, routePlanningMode, setSelectedStart, setSelectedEnd, sceneData } = useScene()
  const [hovered, setHovered] = useState(false)
  const buildings = sceneData?.buildings ?? []

  // Helper to calculate ground level at a position
  const getGroundLevel = useCallback(
    (x: number, z: number) => {
      // x = API X (east-west), z = Three.js Z = API Y (north-south)
      let maxHeight = 0
      console.log(`[GroundLevel] Checking position (${x.toFixed(1)}, ${z.toFixed(1)}) against ${buildings.length} buildings`)
      for (const building of buildings) {
        const inX = x >= building.min[0] && x <= building.max[0]
        const inY = z >= building.min[1] && z <= building.max[1]
        if (inX && inY) {
          console.log(`[GroundLevel] Found building: min=(${building.min.join(',')}), max=(${building.max.join(',')}) height=${building.max[2]}`)
          maxHeight = Math.max(maxHeight, building.max[2])  // Height is API Z
        }
      }
      console.log(`[GroundLevel] Final height: ${maxHeight}`)
      return maxHeight
    },
    [buildings]
  )

  const handleClick = useCallback(
    (event: { point: THREE.Vector3 }) => {
      if (!sceneBounds) return
      if (routePlanningMode !== 'selecting_start' && routePlanningMode !== 'selecting_end') return

      const point = event.point
      // Calculate ground level at clicked position (building top or floor)
      const groundLevel = getGroundLevel(point.x, point.z)

      // API expects [x, y, z] where x=east, y=north, z=altitude
      // Three.js uses x=east, y=up, z=north
      // So: API_x = Three.js_x, API_y = Three.js_z, API_z = altitude
      const position: [number, number, number] = [point.x, point.z, groundLevel]

      if (routePlanningMode === 'selecting_start') {
        setSelectedStart(position)
      } else if (routePlanningMode === 'selecting_end') {
        setSelectedEnd(position)
      }
    },
    [sceneBounds, routePlanningMode, setSelectedStart, setSelectedEnd, getGroundLevel]
  )

  // Change cursor when hovering over clickable area
  useEffect(() => {
    if (routePlanningMode === 'selecting_start' || routePlanningMode === 'selecting_end') {
      document.body.style.cursor = hovered ? 'crosshair' : 'default'
    }
    return () => {
      document.body.style.cursor = 'default'
    }
  }, [hovered, routePlanningMode])

  if (!sceneBounds) return null

  const isClickable = routePlanningMode === 'selecting_start' || routePlanningMode === 'selecting_end'
  const size = Math.max(sceneBounds.size[0], sceneBounds.size[2]) * 2

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[sceneBounds.center[0], 0, sceneBounds.center[2]]}
      onClick={isClickable ? handleClick : undefined}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// ============================================================================
// Camera Controller
// ============================================================================

function PlanningCameraController() {
  const { camera } = useThree()
  const { sceneBounds } = useScene()
  const hasAdjusted = useRef(false)

  useEffect(() => {
    if (sceneBounds && !hasAdjusted.current) {
      const { center, size } = sceneBounds
      const maxDim = Math.max(size[0], size[2])
      const distance = maxDim * 0.8
      const height = Math.max(size[1] * 2.5, 250)

      camera.position.set(center[0] + distance * 0.3, height, center[2] + distance * 0.5)
      camera.lookAt(center[0], center[1], center[2])
      camera.updateProjectionMatrix()
      hasAdjusted.current = true
    }
  }, [sceneBounds, camera])

  return null
}

// ============================================================================
// Scene Content
// ============================================================================

function PlanningSceneContent({ showWindField }: { showWindField: boolean }) {
  const { windFieldData, selectedStart, selectedEnd, sceneBounds, sceneData } = useScene()
  const buildings = sceneData?.buildings ?? []

  return (
    <>

      {/* Lighting */}
      <directionalLight
        position={[150, 300, 150]}
        intensity={1.5}
        color="#fffaf0"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <ambientLight intensity={0.3} />

      <PlanningCameraController />

      {/* Terrain */}
      <Suspense fallback={null}>
        <Terrain />
      </Suspense>

      {/* Wind field */}
      {windFieldData && showWindField && (
        <WindField
          data={windFieldData}
          visible={true}
          streamlineCount={400}
          integrationSteps={20}
          stepSize={6.0}
          arrowSize={4.0}
        />
      )}

      {/* Clickable plane for point selection - only render if bounds available */}
      {sceneBounds && <ClickablePlane />}

      {/* Start marker */}
      {selectedStart && (
        <Marker
          position={selectedStart}
          color="#4ecdc4"
          pulseColor="#2dcea8"
          label="START"
          buildings={buildings}
        />
      )}

      {/* End marker */}
      {selectedEnd && (
        <Marker
          position={selectedEnd}
          color="#ff6b6b"
          pulseColor="#ff4757"
          label="END"
          buildings={buildings}
        />
      )}

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        minDistance={50}
        maxDistance={1500}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2.2}
      />
    </>
  )
}

// ============================================================================
// UI Overlay
// ============================================================================

function PlanningOverlay() {
  const {
    routePlanningMode,
    selectedStart,
    selectedEnd,
    confirmRoute,
    isDataLoaded,
  } = useScene()

  const getMessage = () => {
    if (!isDataLoaded) {
      return 'Loading scene data...'
    }
    switch (routePlanningMode) {
      case 'selecting_start':
        return 'Click on the map to set the START point'
      case 'selecting_end':
        return 'Click on the map to set the END point'
      case 'ready':
        return 'Route ready! Click "Calculate Route" to proceed'
      case 'calculating':
        return 'Calculating optimal route...'
      default:
        return ''
    }
  }

  return (
    <div style={styles.overlay}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Plan Your Route</h2>
      </div>

      {/* Instructions */}
      <div style={styles.instructions}>
        <div style={styles.instructionText}>{getMessage()}</div>

        {/* Step indicators */}
        <div style={styles.steps}>
          <div
            style={{
              ...styles.step,
              ...(selectedStart ? styles.stepComplete : {}),
              ...(routePlanningMode === 'selecting_start' ? styles.stepActive : {}),
            }}
          >
            <span style={styles.stepNumber}>1</span>
            <span style={styles.stepLabel}>Start Point</span>
            {selectedStart && (
              <span style={styles.stepCoords}>
                ({selectedStart[0].toFixed(0)}, {selectedStart[1].toFixed(0)})
              </span>
            )}
          </div>

          <div style={styles.stepConnector} />

          <div
            style={{
              ...styles.step,
              ...(selectedEnd ? styles.stepComplete : {}),
              ...(routePlanningMode === 'selecting_end' ? styles.stepActive : {}),
            }}
          >
            <span style={styles.stepNumber}>2</span>
            <span style={styles.stepLabel}>End Point</span>
            {selectedEnd && (
              <span style={styles.stepCoords}>
                ({selectedEnd[0].toFixed(0)}, {selectedEnd[1].toFixed(0)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Calculate button */}
      {routePlanningMode === 'ready' && (
        <button style={styles.calculateButton} onClick={confirmRoute}>
          Calculate Route
        </button>
      )}

      {/* Loading indicator */}
      {routePlanningMode === 'calculating' && (
        <div style={styles.loadingContainer}>
          <div style={styles.loadingBar}>
            <div style={styles.loadingProgressAnimated} />
          </div>
          <div style={styles.loadingText}>Computing optimal path...</div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function RoutePlanningView({ showWindField = true }: RoutePlanningViewProps) {
  return (
    <div style={styles.container}>
      <Canvas
        camera={{
          position: [300, 400, 400],
          fov: 60,
          near: 0.1,
          far: 5000,
        }}
        shadows
      >
        <PlanningSceneContent showWindField={showWindField} />
      </Canvas>

      <PlanningOverlay />
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginBottom: '20px',
    pointerEvents: 'auto',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  cancelButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 107, 107, 0.9)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  instructions: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '12px',
    padding: '20px 30px',
    backdropFilter: 'blur(10px)',
    textAlign: 'center',
  },
  instructionText: {
    fontSize: '16px',
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    marginBottom: '16px',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transition: 'all 0.2s',
  },
  stepActive: {
    backgroundColor: 'rgba(74, 158, 255, 0.3)',
    boxShadow: '0 0 20px rgba(74, 158, 255, 0.3)',
  },
  stepComplete: {
    backgroundColor: 'rgba(78, 205, 196, 0.3)',
  },
  stepNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: '12px',
    color: '#ccc',
    fontWeight: 500,
  },
  stepCoords: {
    fontSize: '10px',
    color: '#4ecdc4',
    fontFamily: 'monospace',
  },
  stepConnector: {
    width: '40px',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  calculateButton: {
    marginTop: '20px',
    padding: '14px 40px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#4ecdc4',
    color: '#000',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
    pointerEvents: 'auto',
    boxShadow: '0 4px 20px rgba(78, 205, 196, 0.4)',
  },
  loadingContainer: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  loadingBar: {
    width: '200px',
    height: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  loadingProgress: {
    width: '100%',
    height: '100%',
    backgroundColor: '#4ecdc4',
    borderRadius: '3px',
  },
  loadingProgressAnimated: {
    width: '30%',
    height: '100%',
    backgroundColor: '#4ecdc4',
    borderRadius: '3px',
    animation: 'loadingSlide 1.2s ease-in-out infinite',
  },
  loadingText: {
    fontSize: '14px',
    color: '#ccc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  loadingScreen: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    gap: '20px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#4ecdc4',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingScreenText: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
}

// Add keyframes for loading animation
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('route-planning-styles')
  if (!existingStyle) {
    const styleSheet = document.createElement('style')
    styleSheet.id = 'route-planning-styles'
    styleSheet.textContent = `
      @keyframes loadingSlide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(566%); }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(styleSheet)
  }
}
