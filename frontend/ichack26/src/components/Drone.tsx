/**
 * Drone Component
 *
 * Animated drone that follows flight path based on frame data.
 * Shows position, heading (crabbing into wind), and effort level.
 */

import { useRef, useMemo, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FrameData } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface DroneProps {
  /** Current frame data from simulation (or use frameRef for subscription-based updates) */
  frame?: FrameData | null
  /** Optional ref to frame data for subscription-based updates (avoids React re-renders) */
  frameRef?: MutableRefObject<FrameData | null>
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
  /** Show rotor wash particle effect */
  showRotorWash?: boolean
  /** Enable shadow casting */
  castShadow?: boolean
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
// Propellers Component (consolidated - single useFrame for all propellers)
// ============================================================================

interface PropellersProps {
  positions: [number, number, number][]
  speed: number
}

function Propellers({ positions, speed }: PropellersProps) {
  const refs = useRef<(THREE.Mesh | null)[]>([])

  // Single useFrame for all propellers instead of one per propeller
  useFrame((_, delta) => {
    refs.current.forEach((mesh, i) => {
      if (mesh) {
        // Alternate direction for each propeller
        const direction = i % 2 === 0 ? 1 : -1
        mesh.rotation.y += speed * direction * delta
      }
    })
  })

  return (
    <>
      {positions.map((position, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el }}
          position={position}
        >
          <cylinderGeometry args={[0.8, 0.8, 0.05, 16]} />
          <meshStandardMaterial color="#333" transparent opacity={0.7} />
        </mesh>
      ))}
    </>
  )
}

// ============================================================================
// Drone Body Component
// ============================================================================

interface DroneBodyProps {
  color: THREE.Color
  scale: number
  propellerSpeed: number
  castShadow?: boolean
}

// Propeller positions defined once (quadcopter layout)
const PROPELLER_LAYOUT: [number, number, number][] = [
  [1.2, 0.3, 1.2],
  [1.2, 0.3, -1.2],
  [-1.2, 0.3, 1.2],
  [-1.2, 0.3, -1.2],
]

function DroneBody({ color, scale, propellerSpeed, castShadow = true }: DroneBodyProps) {
  return (
    <group scale={scale}>
      {/* Main body */}
      <mesh castShadow={castShadow}>
        <boxGeometry args={[1.5, 0.4, 1.5]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Arms */}
      <mesh rotation={[0, Math.PI / 4, 0]} castShadow={castShadow}>
        <boxGeometry args={[3.5, 0.15, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} castShadow={castShadow}>
        <boxGeometry args={[3.5, 0.15, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* Front indicator (so we can see heading direction) */}
      <mesh position={[0, 0, 0.9]} castShadow={castShadow}>
        <coneGeometry args={[0.2, 0.5, 8]} />
        <meshStandardMaterial color="#ff4444" />
      </mesh>

      {/* Propellers - consolidated into single component with one useFrame */}
      <Propellers positions={PROPELLER_LAYOUT} speed={propellerSpeed} />

      {/* Landing skids */}
      <mesh position={[0.5, -0.3, 0]} castShadow={castShadow}>
        <boxGeometry args={[0.1, 0.2, 2]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[-0.5, -0.3, 0]} castShadow={castShadow}>
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
  // All hooks must be called before any conditional returns
  const windVec = useMemo(() => new THREE.Vector3(...wind), [wind])
  const magnitude = windVec.length()
  const dir = useMemo(() => {
    if (magnitude < 0.1) return new THREE.Vector3(0, 1, 0) // Default direction
    return windVec.clone().normalize()
  }, [windVec, magnitude])

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    return q
  }, [dir])

  // Now safe to return early after all hooks
  if (magnitude < 0.1) return null

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
// Rotor Wash Particles Component
// ============================================================================

interface RotorWashParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  maxAge: number
  size: number
}

interface RotorWashProps {
  /** Propeller positions in local space */
  propellerPositions: [number, number, number][]
  /** Particle color */
  color: THREE.Color
  /** Scale of the drone */
  scale: number
  /** Is the drone active/flying */
  active: boolean
}

// Reusable objects for RotorWash to avoid per-frame allocations
const _rotorVelocityScale = new THREE.Vector3()
const _rotorScaleVec = new THREE.Vector3()
const _zeroScaleMatrix = new THREE.Matrix4().makeScale(0, 0, 0)

function RotorWash({ propellerPositions, color, scale, active }: RotorWashProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const particlesRef = useRef<RotorWashParticle[]>([])
  const lastEmitRef = useRef(0)
  const prevParticleCountRef = useRef(0)

  const maxParticles = 80

  const dummyMatrix = useMemo(() => new THREE.Matrix4(), [])
  const dummyColor = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    if (!meshRef.current) return

    const now = state.clock.elapsedTime
    const particles = particlesRef.current
    const mesh = meshRef.current

    // Emit new particles from each rotor
    if (active && now - lastEmitRef.current > 0.03) {
      propellerPositions.forEach((pos) => {
        if (particles.length < maxParticles) {
          // Emit from slightly below the propeller
          const emitPos = new THREE.Vector3(
            pos[0] * scale + (Math.random() - 0.5) * 0.5 * scale,
            (pos[1] - 0.3) * scale,
            pos[2] * scale + (Math.random() - 0.5) * 0.5 * scale
          )

          particles.push({
            position: emitPos,
            velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              -3 - Math.random() * 2, // Strong downward velocity
              (Math.random() - 0.5) * 2
            ),
            age: 0,
            maxAge: 0.4 + Math.random() * 0.3,
            size: 0.3 + Math.random() * 0.2,
          })
        }
      })
      lastEmitRef.current = now
    }

    // Update and render active particles
    let activeCount = 0
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.age += delta

      if (p.age >= p.maxAge) {
        particles.splice(i, 1)
        continue
      }

      // Update position with velocity - reuse vector for scaling
      _rotorVelocityScale.copy(p.velocity).multiplyScalar(delta)
      p.position.add(_rotorVelocityScale)
      p.velocity.x *= 0.98 // Air resistance
      p.velocity.z *= 0.98
      p.velocity.y *= 0.95 // Slow down falling

      // Calculate opacity and size based on age
      const ageRatio = p.age / p.maxAge
      const currentSize = p.size * (1 - ageRatio * 0.5)
      const opacity = 1 - ageRatio

      dummyMatrix.makeTranslation(p.position.x, p.position.y, p.position.z)
      _rotorScaleVec.set(currentSize, currentSize, currentSize)
      dummyMatrix.scale(_rotorScaleVec)
      mesh.setMatrixAt(activeCount, dummyMatrix)

      // Fade color with age
      dummyColor.copy(color).multiplyScalar(0.3 + opacity * 0.7)
      mesh.setColorAt(activeCount, dummyColor)
      activeCount++
    }

    // Only hide instances that were previously active but are now dead
    // This is much more efficient than hiding ALL instances every frame
    for (let i = activeCount; i < prevParticleCountRef.current; i++) {
      mesh.setMatrixAt(i, _zeroScaleMatrix)
    }
    prevParticleCountRef.current = activeCount

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, maxParticles]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}

// ============================================================================
// Enhanced Motion Trail with Fading
// ============================================================================

interface FadingTrailProps {
  position: THREE.Vector3 | null
  positionRef?: MutableRefObject<THREE.Vector3 | null>
  color: THREE.Color
  maxPoints?: number
  maxAge?: number
  lineWidth?: number
}

function FadingMotionTrail({
  position,
  positionRef,
  color,
  maxPoints = 60,
  maxAge = 1.5,
}: FadingTrailProps) {
  const pointsRef = useRef<{ position: THREE.Vector3; time: number }[]>([])
  const lastAddTimeRef = useRef(0)
  const lastPositionRef = useRef<THREE.Vector3 | null>(null)
  const lineRef = useRef<THREE.Line>(null)

  // Pre-allocate geometry and material
  const { geometry, line } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(maxPoints * 3)
    const colors = new Float32Array(maxPoints * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setDrawRange(0, 0)

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
    })

    const lineObj = new THREE.Line(geo, mat)
    return { geometry: geo, material: mat, line: lineObj }
  }, [maxPoints])

  useFrame((state) => {
    // Prefer positionRef if available (subscription-based updates)
    const currentPosition = positionRef?.current || position
    if (!currentPosition) return

    const now = state.clock.elapsedTime
    const points = pointsRef.current

    // Detect large position jump (new simulation) - clear trail
    if (lastPositionRef.current && currentPosition.distanceTo(lastPositionRef.current) > 50) {
      pointsRef.current = []
    }
    lastPositionRef.current = currentPosition.clone()

    // Add new point (throttled)
    if (now - lastAddTimeRef.current > 0.02) {
      points.push({
        position: currentPosition.clone(),
        time: now,
      })
      lastAddTimeRef.current = now
    }

    // Remove old points
    pointsRef.current = points.filter(p => now - p.time < maxAge).slice(-maxPoints)

    // Update geometry
    if (pointsRef.current.length < 2) {
      geometry.setDrawRange(0, 0)
      return
    }

    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const positions = positionAttr.array as Float32Array
    const colorsArray = colorAttr.array as Float32Array

    pointsRef.current.forEach((p, i) => {
      positions[i * 3] = p.position.x
      positions[i * 3 + 1] = p.position.y
      positions[i * 3 + 2] = p.position.z

      // Fade color based on age (older = more transparent/darker)
      const age = now - p.time
      const fadeRatio = 1 - (age / maxAge)

      colorsArray[i * 3] = color.r * fadeRatio
      colorsArray[i * 3 + 1] = color.g * fadeRatio
      colorsArray[i * 3 + 2] = color.b * fadeRatio
    })

    positionAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    geometry.setDrawRange(0, pointsRef.current.length)
  })

  return <primitive ref={lineRef} object={line} />
}

// ============================================================================
// Main Drone Component
// ============================================================================

// Reuse PROPELLER_LAYOUT for rotor wash (already defined above)

// Reusable objects for per-frame calculations to avoid GC pressure
const _headingVec = new THREE.Vector3()
const _yAxis = new THREE.Vector3(0, 1, 0)

export default function Drone({
  frame: frameProp,
  frameRef,
  color,
  scale = 1.5,
  showEffort = true,
  showHeadingArrow = false,
  showWind = false,
  showTrail = true,
  propellerSpeed = 30,
  label: _label, // Reserved for future text label feature
  showRotorWash = true,
  castShadow = true,
}: DroneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const targetPositionRef = useRef(new THREE.Vector3())
  const targetQuaternionRef = useRef(new THREE.Quaternion())
  const currentPositionRef = useRef(new THREE.Vector3())
  const isInitializedRef = useRef(false)
  const lastFrameTimeRef = useRef<number | null>(null)
  // Store current frame data in a ref for non-re-rendering access
  const currentFrameRef = useRef<FrameData | null>(frameProp || null)
  // Track trail position in a ref to avoid re-renders
  const trailPositionRef = useRef<THREE.Vector3 | null>(null)

  // Calculate color based on effort (uses prop for initial render)
  const droneColor = useMemo(() => {
    if (color) return new THREE.Color(color)
    const frame = frameProp || frameRef?.current
    if (frame && showEffort) return effortToColor(frame.effort)
    return new THREE.Color('#4ecdc4')
  }, [color, frameProp, frameRef, showEffort])

  // Current position for trail - initial value
  const trailPosition = useMemo(() => {
    const frame = frameProp || frameRef?.current
    if (!frame) return null
    return new THREE.Vector3(...frame.position)
  }, [frameProp, frameRef])

  // Update target position and rotation from frame data
  useFrame((_, delta) => {
    // Prefer frameRef if available (subscription-based, avoids React re-renders)
    const frame = frameRef?.current ?? frameProp ?? null
    currentFrameRef.current = frame

    if (!frame || !groupRef.current) return

    // Update trail position ref
    if (!trailPositionRef.current) {
      trailPositionRef.current = new THREE.Vector3(...frame.position)
    } else {
      trailPositionRef.current.set(frame.position[0], frame.position[1], frame.position[2])
    }

    // Update target position
    targetPositionRef.current.set(frame.position[0], frame.position[1], frame.position[2])

    // Check if we need to snap (first frame, large jump, or new simulation)
    const distanceToTarget = currentPositionRef.current.distanceTo(targetPositionRef.current)
    const isNewSimulation = lastFrameTimeRef.current !== null && frame.time < lastFrameTimeRef.current - 0.5
    const needsSnap = !isInitializedRef.current || distanceToTarget > 50 || isNewSimulation

    if (needsSnap) {
      // Snap to target position immediately
      currentPositionRef.current.copy(targetPositionRef.current)
      groupRef.current.position.copy(targetPositionRef.current)
      isInitializedRef.current = true
    } else {
      // Smooth exponential interpolation for position
      // Using 1 - e^(-k*dt) for frame-rate independent smoothing
      // Higher k = faster catch-up, lower k = smoother but more lag
      const smoothingFactor = 8 // Adjust this for smoothness vs responsiveness
      const posLerpFactor = 1 - Math.exp(-smoothingFactor * delta)
      currentPositionRef.current.lerp(targetPositionRef.current, posLerpFactor)
      groupRef.current.position.copy(currentPositionRef.current)
    }

    lastFrameTimeRef.current = frame.time

    // Calculate target rotation from heading - Y-axis rotation only (yaw)
    // Project heading onto XZ plane to keep drone upright
    _headingVec.set(frame.heading[0], 0, frame.heading[2])
    const headingLength = _headingVec.length()

    // Safety check: ensure heading is valid before normalizing
    if (headingLength > 0.01) {
      _headingVec.normalize()

      // Calculate yaw angle from the XZ heading
      const yawAngle = Math.atan2(_headingVec.x, _headingVec.z)
      targetQuaternionRef.current.setFromAxisAngle(_yAxis, yawAngle)
    }

    // Smooth interpolation for rotation (or snap if needed)
    if (needsSnap) {
      groupRef.current.quaternion.copy(targetQuaternionRef.current)
    } else {
      // Frame-rate independent rotation smoothing
      const rotSmoothingFactor = 6
      const rotLerpFactor = 1 - Math.exp(-rotSmoothingFactor * delta)
      groupRef.current.quaternion.slerp(targetQuaternionRef.current, rotLerpFactor)
    }
  })

  // Don't render if no frame data (check both prop and ref)
  const initialFrame = frameProp || frameRef?.current
  if (!initialFrame) return null

  return (
    <group>
      {/* Enhanced fading motion trail - uses ref internally for smooth updates */}
      {showTrail && (
        <FadingMotionTrail
          position={trailPosition}
          positionRef={trailPositionRef}
          color={droneColor}
        />
      )}

      {/* Main drone group (position and rotation controlled by useFrame) */}
      <group ref={groupRef}>
        <DroneBody
          color={droneColor}
          scale={scale}
          propellerSpeed={propellerSpeed}
          castShadow={castShadow}
        />

        {/* Rotor wash particle effect */}
        {showRotorWash && (
          <RotorWash
            propellerPositions={PROPELLER_LAYOUT}
            color={droneColor}
            scale={scale}
            active={true}
          />
        )}

        {/* Heading arrow (shows where drone is pointing) */}
        {showHeadingArrow && initialFrame.heading && (
          <HeadingArrow heading={initialFrame.heading} />
        )}

        {/* Wind vector at drone position */}
        {showWind && initialFrame.wind && (
          <WindVector wind={initialFrame.wind} />
        )}

        {/* Effort glow effect */}
        {showEffort && initialFrame.effort > 0.5 && (
          <pointLight
            color={droneColor}
            intensity={initialFrame.effort * 2}
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
  showRotorWash?: boolean
  castShadow?: boolean
}

export function DualDrones({
  naiveFrame,
  optimizedFrame,
  showNaive = true,
  showOptimized = true,
  scale = 1.5,
  showTrail = true,
  showRotorWash = true,
  castShadow = true,
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
          showRotorWash={showRotorWash}
          castShadow={castShadow}
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
          showRotorWash={showRotorWash}
          castShadow={castShadow}
          label="Optimized"
        />
      )}
    </group>
  )
}
