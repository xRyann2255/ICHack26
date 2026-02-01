/**
 * Drone Flight View Component
 *
 * Phase 2: Side-by-side third-person view of drones flying their routes.
 */

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import Terrain from './Terrain'
import WindField from './WindField'
import FlightPath from './FlightPath'
import Drone from './Drone'
import ThirdPersonCamera from './ThirdPersonCamera'
import MetricsOverlay from './MetricsOverlay'
import { useScene } from '../context/SceneContext'

// ============================================================================
// Types
// ============================================================================

export interface DroneFlightViewProps {
  /** Show wind field visualization */
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
// Flight Scene Content
// ============================================================================

interface FlightSceneProps {
  routeType: 'naive' | 'optimized'
  showWindField: boolean
}

function FlightScene({ routeType, showWindField }: FlightSceneProps) {
  const { windFieldData, paths, currentFrame } = useScene()

  const path = routeType === 'naive' ? paths?.naive : paths?.optimized
  const frame = routeType === 'naive' ? currentFrame.naive : currentFrame.optimized
  const pathColor = routeType === 'naive' ? '#ff6b6b' : '#4ecdc4'

  return (
    <>
      <Lighting />

      <Suspense fallback={<LoadingBox />}>
        <Terrain />
      </Suspense>

      {/* Wind field */}
      {showWindField && windFieldData && (
        <WindField
          data={windFieldData}
          visible={true}
          streamlineCount={500}
          integrationSteps={20}
          stepSize={8.0}
          arrowSize={4.0}
        />
      )}

      {/* Flight path */}
      {path && (
        <FlightPath
          path={path}
          color={pathColor}
          lineWidth={3}
          opacity={0.6}
          showWaypoints={false}
          dashed={routeType === 'naive'}
        />
      )}

      {/* Drone */}
      {frame && (
        <Drone
          frame={frame}
          color={pathColor}
          scale={2.5}
          showTrail={true}
          showEffort={true}
          showWind={true}
        />
      )}

      {/* Third-person camera */}
      <ThirdPersonCamera
        position={frame?.position || null}
        heading={frame?.heading || null}
        followDistance={50}
        followHeight={25}
        smoothing={1.0}
        active={true}
      />

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
        fadeDistance={150}
        infiniteGrid
      />
    </>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function DroneFlightView({
  showWindField = true,
}: DroneFlightViewProps) {
  const { currentFrame, paths } = useScene()

  return (
    <div style={styles.container}>
      {/* Left panel - Naive route */}
      <div style={styles.panel}>
        <div style={{ ...styles.label, backgroundColor: 'rgba(255, 107, 107, 0.9)' }}>
          Naive Route
        </div>
        <Canvas camera={{
          position: [300, 200, 300],
          fov: 60,
          near: 0.1,
          far: 5000,
        }} shadows style={{ background: '#1a1a2e' }}>
          <color attach="background" args={['#1a1a2e']} />
          <fog attach="fog" args={['#1a1a2e', 200, 800]} />
          <FlightScene routeType="naive" showWindField={showWindField} />
        </Canvas>
        <MetricsOverlay
          frame={currentFrame.naive}
          routeType="naive"
          totalWaypoints={paths?.naive?.length || 0}
        />
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Right panel - Optimized route */}
      <div style={styles.panel}>
        <div style={{ ...styles.label, backgroundColor: 'rgba(78, 205, 196, 0.9)' }}>
          Wind-Optimized Route
        </div>
        <Canvas camera={{
          position: [300, 200, 300],
          fov: 60,
          near: 0.1,
          far: 5000,
        }} shadows style={{ background: '#1a1a2e' }}>
          <color attach="background" args={['#1a1a2e']} />
          <fog attach="fog" args={['#1a1a2e', 200, 800]} />
          <FlightScene routeType="optimized" showWindField={showWindField} />
        </Canvas>
        <MetricsOverlay
          frame={currentFrame.optimized}
          routeType="optimized"
          totalWaypoints={paths?.optimized?.length || 0}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
  },
  panel: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  divider: {
    width: 3,
    backgroundColor: '#333',
    boxShadow: '0 0 10px rgba(0,0,0,0.5)',
    zIndex: 10,
  },
}
