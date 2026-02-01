/**
 * Drone Flight View Component
 *
 * Phase 2: Side-by-side third-person view of drones flying their routes.
 */

import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import Terrain from './Terrain'
import WindField from './WindField'
import FlightPath from './FlightPath'
import Drone from './Drone'
import ThirdPersonCamera from './ThirdPersonCamera'
import MetricsOverlay from './MetricsOverlay'
import { useScene } from '../context/SceneContext'
import type { FrameData } from '../types/api'

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
// Subscribed Drone Component - reads frame data via subscription, not React state
// ============================================================================

interface SubscribedDroneProps {
  routeType: 'naive' | 'optimized'
  color: string
}

function SubscribedDrone({ routeType, color }: SubscribedDroneProps) {
  const { subscribeToFrames, getCurrentFrames } = useScene()
  const frameRef = useRef<FrameData | null>(null)
  const [hasFrame, setHasFrame] = useState(false)

  // Subscribe to frame updates - store in ref for useFrame access
  useEffect(() => {
    // Get initial frame
    const frames = getCurrentFrames()
    const frame = routeType === 'naive' ? frames.naive : frames.optimized
    frameRef.current = frame
    if (frame) setHasFrame(true)

    // Subscribe to updates
    const unsubscribe = subscribeToFrames((frames) => {
      const newFrame = routeType === 'naive' ? frames.naive : frames.optimized
      frameRef.current = newFrame
      // Only trigger re-render once when we first get a frame
      if (newFrame && !hasFrame) {
        setHasFrame(true)
      }
    })
    return unsubscribe
  }, [subscribeToFrames, getCurrentFrames, routeType, hasFrame])

  // Don't render until we have frame data
  if (!hasFrame && !frameRef.current) return null

  // Pass frameRef directly - Drone reads from ref in useFrame, no React re-renders
  return (
    <Drone
      frameRef={frameRef}
      color={color}
      scale={2.5}
      showTrail={true}
      showEffort={true}
      showWind={true}
    />
  )
}

// ============================================================================
// Subscribed Camera Component - reads position via subscription
// ============================================================================

interface SubscribedCameraProps {
  routeType: 'naive' | 'optimized'
}

function SubscribedCamera({ routeType }: SubscribedCameraProps) {
  const { subscribeToFrames, getCurrentFrames } = useScene()
  const frameRef = useRef<FrameData | null>(null)

  // Subscribe to frame updates
  useEffect(() => {
    const frames = getCurrentFrames()
    frameRef.current = routeType === 'naive' ? frames.naive : frames.optimized

    const unsubscribe = subscribeToFrames((frames) => {
      frameRef.current = routeType === 'naive' ? frames.naive : frames.optimized
    })
    return unsubscribe
  }, [subscribeToFrames, getCurrentFrames, routeType])

  return (
    <ThirdPersonCamera
      position={frameRef.current?.position || null}
      heading={frameRef.current?.heading || null}
      followDistance={50}
      followHeight={25}
      smoothing={0.05}
      active={true}
      frameRef={frameRef}
    />
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
  const { windFieldData, paths } = useScene()

  const path = routeType === 'naive' ? paths?.naive : paths?.optimized
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

      {/* Drone - uses subscription for smooth updates */}
      <SubscribedDrone routeType={routeType} color={pathColor} />

      {/* Third-person camera - uses subscription for smooth updates */}
      <SubscribedCamera routeType={routeType} />

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
