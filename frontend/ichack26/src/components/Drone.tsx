/**
 * Drone Component
 *
 * Animated drone that follows flight path based on frame data.
 * Shows position, heading (crabbing into wind), and effort level.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FrameData } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface DroneProps {
  /** Current frame data from simulation */
  frame: FrameData | null
  /** Drone color (default varies by effort) */
  color?: string
  /** Scale multiplier */
  scale?: number
  /** Show effort as color gradient */
  showEffort?: boolean
  /** Show heading arrow */
  showHeadingArrow?: boolean
  /** Show wind vector at drone position */
  showWind?: boolean
  /** Trail effect */
  showTrail?: boolean
  /** Propeller spin speed */
  propellerSpeed?: number
  /** Label text (e.g., "Naive" or "Optimized") */
  label?: string
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Interpolate between green (low effort) and red (high effort)
 */
function effortToColor(effort: number): THREE.Color {
  // Clamp effort to 0-1
  const e = Math.max(0, Math.min(1, effort))

  // Green (0,1,0) -> Yellow (1,1,0) -> Red (1,0,0)
  if (e < 0.5) {
    // Green to Yellow
    return new THREE.Color(e * 2, 1, 0)
  } else {
    // Yellow to Red
    return new THREE.Color(1, 1 - (e - 0.5) * 2, 0)
  }
}

// ============================================================================
// Propeller Component
// ============================================================================

interface PropellerProps {
  position: [number, number, number]
  speed: number
}

function Propeller({ position, speed }: PropellerProps) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += speed * delta
    }
  })

  return (
    <mesh ref={ref} position={position}>
      <cylinderGeometry args={[0.8, 0.8, 0.05, 16]} />
      <meshStandardMaterial color="#333" transparent opacity={0.7} />
    </mesh>
  )
}

// ============================================================================
// Drone Body Component
// ============================================================================

interface DroneBodyProps {
  color: THREE.Color
  scale: number
  propellerSpeed: number
}

function DroneBody({ color, scale, propellerSpeed }: DroneBodyProps) {
  // Propeller positions (quadcopter layout)
  const propellerPositions: [number, number, number][] = [
    [1.2, 0.3, 1.2],
    [1.2, 0.3, -1.2],
    [-1.2, 0.3, 1.2],
    [-1.2, 0.3, -1.2],
  ]

  return (
    <group scale={scale}>
      {/* Main body */}
      <mesh>
        <boxGeometry args={[1.5, 0.4, 1.5]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Arms */}
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[3.5, 0.15, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[3.5, 0.15, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* Front indicator (so we can see heading direction) */}
      <mesh position={[0, 0, 0.9]}>
        <coneGeometry args={[0.2, 0.5, 8]} />
        <meshStandardMaterial color="#ff4444" />
      </mesh>

      {/* Propellers */}
      {propellerPositions.map((pos, i) => (
        <Propeller
          key={i}
          position={pos}
          speed={propellerSpeed * (i % 2 === 0 ? 1 : -1)} // Alternate directions
        />
      ))}

      {/* Landing skids */}
      <mesh position={[0.5, -0.3, 0]}>
        <boxGeometry args={[0.1, 0.2, 2]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[-0.5, -0.3, 0]}>
        <boxGeometry args={[0.1, 0.2, 2]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  )
}

// ============================================================================
// Heading Arrow Component
// ============================================================================

interface HeadingArrowProps {
  heading: [number, number, number]
  length?: number
}

function HeadingArrow({ heading, length = 5 }: HeadingArrowProps) {
  const dir = useMemo(() => {
    return new THREE.Vector3(...heading).normalize()
  }, [heading])

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    return q
  }, [dir])

  return (
    <group quaternion={quaternion}>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[0.1, 0.1, length, 8]} />
        <meshBasicMaterial color="#00ffff" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, length, 0]}>
        <coneGeometry args={[0.3, 0.8, 8]} />
        <meshBasicMaterial color="#00ffff" />
      </mesh>
    </group>
  )
}

// ============================================================================
// Wind Vector Component
// ============================================================================

interface WindVectorProps {
  wind: [number, number, number]
  scale?: number
}

function WindVector({ wind, scale = 0.5 }: WindVectorProps) {
  const windVec = useMemo(() => new THREE.Vector3(...wind), [wind])
  const magnitude = windVec.length()

  if (magnitude < 0.1) return null

  const dir = windVec.clone().normalize()
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    return q
  }, [dir])

  const length = magnitude * scale

  return (
    <group quaternion={quaternion}>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[0.15, 0.15, length, 8]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, length, 0]}>
        <coneGeometry args={[0.4, 0.8, 8]} />
        <meshBasicMaterial color="#ffaa00" />
      </mesh>
    </group>
  )
}

// ============================================================================
// Trail Component
// ============================================================================

interface TrailPoint {
  position: THREE.Vector3
  time: number
}

function useTrail(position: THREE.Vector3 | null, maxPoints = 50, maxAge = 2) {
  const pointsRef = useRef<TrailPoint[]>([])
  const lastAddTimeRef = useRef(0)

  useFrame((state) => {
    if (!position) return

    const now = state.clock.elapsedTime

    // Add new point (throttled)
    if (now - lastAddTimeRef.current > 0.05) {
      pointsRef.current.push({
        position: position.clone(),
        time: now,
      })
      lastAddTimeRef.current = now
    }

    // Remove old points
    pointsRef.current = pointsRef.current.filter(
      p => now - p.time < maxAge
    ).slice(-maxPoints)
  })

  return pointsRef
}

interface DroneTrailProps {
  position: THREE.Vector3 | null
  color: THREE.Color
}

function DroneTrail({ position, color }: DroneTrailProps) {
  const trailRef = useTrail(position)
  const lineRef = useRef<THREE.Line | null>(null)
  const materialRef = useRef<THREE.LineBasicMaterial | null>(null)

  // Create line geometry and material once
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(50 * 3) // Max 50 points
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setDrawRange(0, 0)

    const mat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5,
    })

    return { geometry: geo, material: mat }
  }, [color])

  // Update positions each frame
  useFrame(() => {
    if (!geometry || trailRef.current.length < 2) {
      geometry.setDrawRange(0, 0)
      return
    }

    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = positionAttr.array as Float32Array

    trailRef.current.forEach((p, i) => {
      positions[i * 3] = p.position.x
      positions[i * 3 + 1] = p.position.y
      positions[i * 3 + 2] = p.position.z
    })

    positionAttr.needsUpdate = true
    geometry.setDrawRange(0, trailRef.current.length)
  })

  // Update material color
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.color.copy(color)
    }
  })

  return (
    <primitive
      ref={lineRef}
      object={new THREE.Line(geometry, material)}
    />
  )
}

// ============================================================================
// Main Drone Component
// ============================================================================

export default function Drone({
  frame,
  color,
  scale = 1.5,
  showEffort = true,
  showHeadingArrow = false,
  showWind = false,
  showTrail = true,
  propellerSpeed = 30,
  label: _label, // Reserved for future text label feature
}: DroneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const targetPositionRef = useRef(new THREE.Vector3())
  const targetQuaternionRef = useRef(new THREE.Quaternion())
  const currentPositionRef = useRef(new THREE.Vector3())

  // Calculate color based on effort
  const droneColor = useMemo(() => {
    if (color) return new THREE.Color(color)
    if (frame && showEffort) return effortToColor(frame.effort)
    return new THREE.Color('#4ecdc4')
  }, [color, frame, showEffort])

  // Current position for trail
  const trailPosition = useMemo(() => {
    if (!frame) return null
    return new THREE.Vector3(...frame.position)
  }, [frame])

  // Update target position and rotation from frame data
  useFrame((_, delta) => {
    if (!frame || !groupRef.current) return

    // Update target position
    targetPositionRef.current.set(...frame.position)

    // Calculate target rotation from heading - Y-axis rotation only (yaw)
    // Project heading onto XZ plane to keep drone upright
    const heading = new THREE.Vector3(frame.heading[0], 0, frame.heading[2])
    const headingLength = heading.length()

    // Safety check: ensure heading is valid before normalizing
    if (headingLength > 0.01) {
      heading.normalize()

      // Calculate yaw angle from the XZ heading
      // atan2 gives us the angle from +Z axis to the heading direction
      const yawAngle = Math.atan2(heading.x, heading.z)
      targetQuaternionRef.current.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle)
    }
    // If heading is invalid, keep the previous rotation (don't update targetQuaternionRef)

    // Smooth interpolation for position - use faster lerp for more responsive movement
    const posLerpFactor = Math.min(1, delta * 15)
    currentPositionRef.current.lerp(targetPositionRef.current, posLerpFactor)
    groupRef.current.position.copy(currentPositionRef.current)

    // Smooth interpolation for rotation
    groupRef.current.quaternion.slerp(targetQuaternionRef.current, Math.min(1, delta * 10))
  })

  // Don't render if no frame data
  if (!frame) return null

  return (
    <group>
      {/* Trail effect */}
      {showTrail && (
        <DroneTrail position={trailPosition} color={droneColor} />
      )}

      {/* Main drone group (position and rotation controlled by useFrame) */}
      <group ref={groupRef}>
        <DroneBody
          color={droneColor}
          scale={scale}
          propellerSpeed={propellerSpeed}
        />

        {/* Heading arrow (shows where drone is pointing) */}
        {showHeadingArrow && frame.heading && (
          <HeadingArrow heading={frame.heading} />
        )}

        {/* Wind vector at drone position */}
        {showWind && frame.wind && (
          <WindVector wind={frame.wind} />
        )}

        {/* Effort glow effect */}
        {showEffort && frame.effort > 0.5 && (
          <pointLight
            color={droneColor}
            intensity={frame.effort * 2}
            distance={10}
          />
        )}
      </group>
    </group>
  )
}

// ============================================================================
// Dual Drone Component (for side-by-side comparison)
// ============================================================================

export interface DualDronesProps {
  naiveFrame: FrameData | null
  optimizedFrame: FrameData | null
  showNaive?: boolean
  showOptimized?: boolean
  scale?: number
  showTrail?: boolean
}

export function DualDrones({
  naiveFrame,
  optimizedFrame,
  showNaive = true,
  showOptimized = true,
  scale = 1.5,
  showTrail = true,
}: DualDronesProps) {
  return (
    <group>
      {showNaive && naiveFrame && (
        <Drone
          frame={naiveFrame}
          color="#ff6b6b"
          scale={scale}
          showEffort={true}
          showTrail={showTrail}
          label="Naive"
        />
      )}
      {showOptimized && optimizedFrame && (
        <Drone
          frame={optimizedFrame}
          color="#4ecdc4"
          scale={scale}
          showEffort={true}
          showTrail={showTrail}
          label="Optimized"
        />
      )}
    </group>
  )
}
