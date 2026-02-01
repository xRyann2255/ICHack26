/**
 * Wind Field Visualization Component
 *
 * Renders wind as streamlines with arrowheads showing flow direction.
 * Colors indicate velocity magnitude using a blue-to-red heatmap.
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WindFieldData, Bounds } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface WindFieldProps {
  data: WindFieldData
  visible?: boolean
  /** Number of streamlines to generate */
  streamlineCount?: number
  /** Number of integration steps per streamline */
  integrationSteps?: number
  /** Step size for integration (in meters) */
  stepSize?: number
  /** Opacity of the streamlines */
  opacity?: number
  /** Size of arrow heads */
  arrowSize?: number
  /** Number of curve subdivisions per segment for smoothness */
  curveSegments?: number
  /** Enable animated particles flowing along streamlines */
  animatedParticles?: boolean
  /** Number of animated particles */
  particleCount?: number
  /** Speed multiplier for particle animation */
  particleSpeed?: number
  /** Base interval between arrows (in number of points along streamline) */
  arrowInterval?: number
  /** Add extra arrows at high-curvature (direction change) points */
  curvatureAwareArrows?: boolean
  /** Threshold angle (radians) to consider as high curvature for extra arrows */
  curvatureThreshold?: number
}

interface StreamlineData {
  points: THREE.Vector3[]
  velocities: number[]
  direction: THREE.Vector3
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Get heatmap color from blue (low) to red (high)
 * Smooth gradient through the spectrum
 */
function velocityToColor(normalizedVelocity: number): THREE.Color {
  const t = Math.max(0, Math.min(1, normalizedVelocity))
  const color = new THREE.Color()

  // HSL interpolation: Blue (0.66) -> Cyan -> Green -> Yellow -> Red (0.0)
  const hue = 0.66 * (1 - t)
  const saturation = 0.9
  const lightness = 0.55

  color.setHSL(hue, saturation, lightness)
  return color
}

/**
 * Same as velocityToColor but writes to existing Color object to avoid allocations
 */
function velocityToColorInPlace(normalizedVelocity: number, outColor: THREE.Color): void {
  const t = Math.max(0, Math.min(1, normalizedVelocity))
  const hue = 0.66 * (1 - t)
  outColor.setHSL(hue, 0.9, 0.55)
}

// ============================================================================
// Wind Field Sampling (Trilinear Interpolation) - Optimized with object pooling
// ============================================================================

// Reusable Vector3 pool to avoid GC pressure during intensive sampling
const _v000 = new THREE.Vector3()
const _v100 = new THREE.Vector3()
const _v010 = new THREE.Vector3()
const _v110 = new THREE.Vector3()
const _v001 = new THREE.Vector3()
const _v101 = new THREE.Vector3()
const _v011 = new THREE.Vector3()
const _v111 = new THREE.Vector3()
const _c00 = new THREE.Vector3()
const _c10 = new THREE.Vector3()
const _c01 = new THREE.Vector3()
const _c11 = new THREE.Vector3()
const _c0 = new THREE.Vector3()
const _c1 = new THREE.Vector3()
const _result = new THREE.Vector3()

function sampleWindField(
  position: THREE.Vector3,
  windVectors: [number, number, number][],
  shape: [number, number, number],
  bounds: Bounds,
  resolution: number
): THREE.Vector3 {
  const [nx, ny, nz] = shape

  const gx = (position.x - bounds.min[0]) / resolution
  const gy = (position.y - bounds.min[1]) / resolution
  const gz = (position.z - bounds.min[2]) / resolution

  const x0 = Math.max(0, Math.min(nx - 2, Math.floor(gx)))
  const y0 = Math.max(0, Math.min(ny - 2, Math.floor(gy)))
  const z0 = Math.max(0, Math.min(nz - 2, Math.floor(gz)))

  const x1 = x0 + 1
  const y1 = y0 + 1
  const z1 = z0 + 1

  const tx = Math.max(0, Math.min(1, gx - x0))
  const ty = Math.max(0, Math.min(1, gy - y0))
  const tz = Math.max(0, Math.min(1, gz - z0))

  const getIndex = (ix: number, iy: number, iz: number) => ix + iy * nx + iz * nx * ny

  // Inline vector fetching to reusable objects
  const setVec = (out: THREE.Vector3, idx: number): void => {
    if (idx >= 0 && idx < windVectors.length) {
      const v = windVectors[idx]
      out.set(v[0], v[1], v[2])
    } else {
      out.set(0, 0, 0)
    }
  }

  setVec(_v000, getIndex(x0, y0, z0))
  setVec(_v100, getIndex(x1, y0, z0))
  setVec(_v010, getIndex(x0, y1, z0))
  setVec(_v110, getIndex(x1, y1, z0))
  setVec(_v001, getIndex(x0, y0, z1))
  setVec(_v101, getIndex(x1, y0, z1))
  setVec(_v011, getIndex(x0, y1, z1))
  setVec(_v111, getIndex(x1, y1, z1))

  // Trilinear interpolation using reusable vectors
  _c00.copy(_v000).lerp(_v100, tx)
  _c10.copy(_v010).lerp(_v110, tx)
  _c01.copy(_v001).lerp(_v101, tx)
  _c11.copy(_v011).lerp(_v111, tx)

  _c0.copy(_c00).lerp(_c10, ty)
  _c1.copy(_c01).lerp(_c11, ty)

  // Return a clone since caller may store the result
  return _result.copy(_c0).lerp(_c1, tz).clone()
}

function isInBounds(position: THREE.Vector3, bounds: Bounds, margin: number = 0): boolean {
  return (
    position.x >= bounds.min[0] - margin && position.x <= bounds.max[0] + margin &&
    position.y >= bounds.min[1] - margin && position.y <= bounds.max[1] + margin &&
    position.z >= bounds.min[2] - margin && position.z <= bounds.max[2] + margin
  )
}

// ============================================================================
// Streamline Generation
// ============================================================================

/**
 * Generate seed points on a regular 3D grid for consistent coverage
 */
function generateGridSeeds(bounds: Bounds, countPerAxis: number): THREE.Vector3[] {
  const seeds: THREE.Vector3[] = []
  const [minX, minY, minZ] = bounds.min
  const [maxX, maxY, maxZ] = bounds.max

  const stepX = (maxX - minX) / countPerAxis
  const stepY = (maxY - minY) / countPerAxis
  const stepZ = (maxZ - minZ) / Math.max(1, Math.floor(countPerAxis / 2))

  for (let iz = 0; iz <= Math.floor(countPerAxis / 2); iz++) {
    for (let iy = 0; iy <= countPerAxis; iy++) {
      for (let ix = 0; ix <= countPerAxis; ix++) {
        // Add slight jitter to avoid perfectly aligned lines
        const jitterX = (Math.random() - 0.5) * stepX * 0.3
        const jitterY = (Math.random() - 0.5) * stepY * 0.3
        const jitterZ = (Math.random() - 0.5) * stepZ * 0.3

        const x = minX + ix * stepX + jitterX
        const y = minY + iy * stepY + jitterY
        const z = minZ + iz * stepZ + jitterZ

        seeds.push(new THREE.Vector3(
          Math.max(minX, Math.min(maxX, x)),
          Math.max(minY, Math.min(maxY, y)),
          Math.max(minZ, Math.min(maxZ, z))
        ))
      }
    }
  }

  return seeds
}

/**
 * Advect a particle through the wind field using RK4 integration
 */
function advectStreamline(
  seed: THREE.Vector3,
  windVectors: [number, number, number][],
  shape: [number, number, number],
  bounds: Bounds,
  resolution: number,
  steps: number,
  stepSize: number,
  maxSpeed: number
): StreamlineData | null {
  const points: THREE.Vector3[] = []
  const velocities: number[] = []
  const position = seed.clone()
  let lastDirection = new THREE.Vector3()

  for (let i = 0; i < steps; i++) {
    if (!isInBounds(position, bounds)) break

    // RK4 integration
    const k1 = sampleWindField(position, windVectors, shape, bounds, resolution)
    const p2 = position.clone().add(k1.clone().multiplyScalar(stepSize * 0.5))
    const k2 = sampleWindField(p2, windVectors, shape, bounds, resolution)
    const p3 = position.clone().add(k2.clone().multiplyScalar(stepSize * 0.5))
    const k3 = sampleWindField(p3, windVectors, shape, bounds, resolution)
    const p4 = position.clone().add(k3.clone().multiplyScalar(stepSize))
    const k4 = sampleWindField(p4, windVectors, shape, bounds, resolution)

    const velocity = k1.clone()
      .add(k2.clone().multiplyScalar(2))
      .add(k3.clone().multiplyScalar(2))
      .add(k4)
      .multiplyScalar(1/6)

    const speed = velocity.length()
    if (speed < 0.001) break

    points.push(position.clone())
    velocities.push(speed / maxSpeed)
    lastDirection.copy(velocity).normalize()

    velocity.normalize().multiplyScalar(stepSize)
    position.add(velocity)
  }

  if (points.length < 2) return null

  return { points, velocities, direction: lastDirection }
}

// ============================================================================
// Streamline Rendering Components
// ============================================================================

interface StreamlineLinesProps {
  streamlines: StreamlineData[]
  opacity: number
  curveSegments?: number
}

/**
 * Render streamlines as smooth CatmullRom spline curves.
 * This creates flowing, curved lines that smoothly follow wind direction changes.
 * Uses a single shared material for all lines to reduce GPU state changes.
 */
function StreamlineLines({ streamlines, opacity, curveSegments = 5 }: StreamlineLinesProps) {
  // Create ONE shared material for all streamlines
  const sharedMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: opacity,
      linewidth: 1,
    })
  }, [opacity])

  const lines = useMemo(() => {
    // Reusable color object to avoid allocations
    const tempColor = new THREE.Color()

    return streamlines.map(({ points, velocities }) => {
      // Need at least 2 points for a curve
      if (points.length < 2) {
        return null
      }

      const geo = new THREE.BufferGeometry()

      // Create a smooth CatmullRom spline through the advected points
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)

      // Sample more points along the curve for smooth rendering
      const numSamples = Math.max(points.length * curveSegments, 10)
      const sampledPoints = curve.getPoints(numSamples)

      const positions = new Float32Array(sampledPoints.length * 3)
      const colors = new Float32Array(sampledPoints.length * 3)

      for (let i = 0; i < sampledPoints.length; i++) {
        const p = sampledPoints[i]
        const i3 = i * 3
        positions[i3] = p.x
        positions[i3 + 1] = p.y
        positions[i3 + 2] = p.z

        // Interpolate velocity for color based on position along curve
        const t = i / (sampledPoints.length - 1)
        const velocityIndex = t * (velocities.length - 1)
        const lowIdx = Math.floor(velocityIndex)
        const highIdx = Math.min(lowIdx + 1, velocities.length - 1)
        const frac = velocityIndex - lowIdx
        const interpolatedVelocity = velocities[lowIdx] * (1 - frac) + velocities[highIdx] * frac

        // Reuse tempColor to avoid allocations
        velocityToColorInPlace(interpolatedVelocity, tempColor)
        colors[i3] = tempColor.r
        colors[i3 + 1] = tempColor.g
        colors[i3 + 2] = tempColor.b
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

      // Use shared material instead of creating new one
      return new THREE.Line(geo, sharedMaterial)
    }).filter((line) => line !== null) as THREE.Line[]
  }, [streamlines, curveSegments, opacity])

  return (
    <>
      {lines.map((lineObj, i) => (
        <primitive key={`line-${i}`} object={lineObj} />
      ))}
    </>
  )
}

// ============================================================================
// Arrow Heads using Instanced Mesh
// ============================================================================

interface ArrowHeadsProps {
  streamlines: StreamlineData[]
  arrowSize: number
  opacity: number
  /** Base interval between arrows (in number of points) */
  arrowInterval?: number
  /** Add extra arrows at high-curvature points */
  curvatureAware?: boolean
  /** Threshold angle (radians) to consider as high curvature */
  curvatureThreshold?: number
}

/**
 * Calculate curvature at a point on the streamline
 * Returns angle in radians between incoming and outgoing directions
 */
function calculateCurvature(
  points: THREE.Vector3[],
  index: number
): number {
  if (index <= 0 || index >= points.length - 1) return 0

  const prev = points[index - 1]
  const curr = points[index]
  const next = points[index + 1]

  const dir1 = new THREE.Vector3().subVectors(curr, prev).normalize()
  const dir2 = new THREE.Vector3().subVectors(next, curr).normalize()

  // Angle between directions (0 = straight, PI = 180 degree turn)
  const dot = Math.max(-1, Math.min(1, dir1.dot(dir2)))
  return Math.acos(dot)
}

function ArrowHeads({
  streamlines,
  arrowSize,
  opacity,
  arrowInterval = 3,
  curvatureAware = true,
  curvatureThreshold = 0.15 // ~8.5 degrees
}: ArrowHeadsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { count, matrices, colors } = useMemo(() => {
    // First pass: count total arrows needed
    let totalArrows = 0
    const arrowData: { position: THREE.Vector3; direction: THREE.Vector3; velocity: number }[] = []

    const tempDir = new THREE.Vector3()

    streamlines.forEach((streamline) => {
      const { points, velocities } = streamline
      if (points.length < 2) return

      let lastArrowIndex = -arrowInterval // Allow first arrow at start

      for (let i = 0; i < points.length; i++) {
        const curvature = calculateCurvature(points, i)
        const isHighCurvature = curvatureAware && curvature > curvatureThreshold
        const distFromLastArrow = i - lastArrowIndex

        // Place arrow if:
        // 1. We've traveled arrowInterval points since last arrow, OR
        // 2. This is a high-curvature point (and we're at least 1 point from last arrow), OR
        // 3. This is the last point
        const shouldPlaceArrow =
          distFromLastArrow >= arrowInterval ||
          (isHighCurvature && distFromLastArrow >= 1) ||
          i === points.length - 1

        if (shouldPlaceArrow && i > 0) {
          // Calculate direction from previous point
          tempDir.subVectors(points[i], points[i - 1]).normalize()

          // Skip if direction is too small (stationary)
          if (tempDir.length() > 0.01) {
            arrowData.push({
              position: points[i].clone(),
              direction: tempDir.clone(),
              velocity: velocities[i] || velocities[velocities.length - 1]
            })
            lastArrowIndex = i
            totalArrows++
          }
        }
      }
    })

    const matricesArray = new Float32Array(totalArrows * 16)
    const colorsArray = new Float32Array(totalArrows * 3)

    const tempMatrix = new THREE.Matrix4()
    const tempQuaternion = new THREE.Quaternion()
    const tempScale = new THREE.Vector3(arrowSize, arrowSize * 1.5, arrowSize)
    const upVector = new THREE.Vector3(0, 1, 0)

    arrowData.forEach((arrow, i) => {
      // Rotate cone to point in wind direction
      if (arrow.direction.length() > 0.01) {
        tempQuaternion.setFromUnitVectors(upVector, arrow.direction)
      } else {
        tempQuaternion.identity()
      }

      tempMatrix.compose(arrow.position, tempQuaternion, tempScale)
      tempMatrix.toArray(matricesArray, i * 16)

      const color = velocityToColor(arrow.velocity)
      colorsArray[i * 3] = color.r
      colorsArray[i * 3 + 1] = color.g
      colorsArray[i * 3 + 2] = color.b
    })

    return { count: totalArrows, matrices: matricesArray, colors: colorsArray }
  }, [streamlines, arrowSize, arrowInterval, curvatureAware, curvatureThreshold])

  // Create cone geometry for arrows
  const coneGeometry = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.4, 1.2, 6)
    geo.translate(0, 0.6, 0) // Move pivot to base
    return geo
  }, [])

  // Apply matrices and colors to instanced mesh
  useEffect(() => {
    if (!meshRef.current || count === 0) return

    const mesh = meshRef.current
    const tempMatrix = new THREE.Matrix4()

    for (let i = 0; i < count; i++) {
      tempMatrix.fromArray(matrices, i * 16)
      mesh.setMatrixAt(i, tempMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    const colorAttr = new THREE.InstancedBufferAttribute(colors, 3)
    mesh.instanceColor = colorAttr
  }, [count, matrices, colors])

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[coneGeometry, undefined, count]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
      />
    </instancedMesh>
  )
}

// ============================================================================
// Animated Streamline Particles
// ============================================================================

interface AnimatedParticlesProps {
  streamlines: StreamlineData[]
  particleCount: number
  speedMultiplier: number
}

interface StreamlineParticle {
  streamlineIndex: number
  progress: number  // 0-1 along the streamline
  speed: number     // Particles move at different speeds
}

/**
 * Animated particles that flow along existing streamlines.
 * Creates a sense of wind movement without removing the static streamlines.
 */
function AnimatedStreamlineParticles({
  streamlines,
  particleCount,
  speedMultiplier
}: AnimatedParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const particlesRef = useRef<StreamlineParticle[]>([])

  // Initialize particles distributed across streamlines
  useEffect(() => {
    if (streamlines.length === 0) return

    const particles: StreamlineParticle[] = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        streamlineIndex: Math.floor(Math.random() * streamlines.length),
        progress: Math.random(),
        speed: 0.3 + Math.random() * 0.7, // Vary speed between 0.3-1.0
      })
    }
    particlesRef.current = particles
  }, [streamlines, particleCount])

  // Create geometry and temp objects once
  const { sphereGeometry, dummyMatrix, dummyColor } = useMemo(() => ({
    sphereGeometry: new THREE.SphereGeometry(1.5, 8, 8),
    dummyMatrix: new THREE.Matrix4(),
    dummyColor: new THREE.Color(),
  }), [])

  useFrame((_, delta) => {
    if (!meshRef.current || streamlines.length === 0) return

    const mesh = meshRef.current
    const particles = particlesRef.current

    particles.forEach((particle, i) => {
      const streamline = streamlines[particle.streamlineIndex]
      if (!streamline || streamline.points.length < 2) return

      // Advance particle along streamline
      particle.progress += delta * particle.speed * speedMultiplier * 0.15

      // Wrap around when reaching end
      if (particle.progress >= 1) {
        particle.progress = 0
        // Optionally switch to a different streamline for variety
        if (Math.random() > 0.7) {
          particle.streamlineIndex = Math.floor(Math.random() * streamlines.length)
        }
      }

      // Interpolate position along streamline points
      const points = streamline.points
      const velocities = streamline.velocities
      const totalSegments = points.length - 1
      const segmentFloat = particle.progress * totalSegments
      const segmentIndex = Math.min(Math.floor(segmentFloat), totalSegments - 1)
      const segmentT = segmentFloat - segmentIndex

      const p1 = points[segmentIndex]
      const p2 = points[segmentIndex + 1]

      // Lerp between segment points
      const x = p1.x + (p2.x - p1.x) * segmentT
      const y = p1.y + (p2.y - p1.y) * segmentT
      const z = p1.z + (p2.z - p1.z) * segmentT

      // Get velocity for color
      const v1 = velocities[segmentIndex] || 0.5
      const v2 = velocities[Math.min(segmentIndex + 1, velocities.length - 1)] || 0.5
      const velocity = v1 + (v2 - v1) * segmentT

      // Scale based on velocity
      const scale = 0.8 + velocity * 0.4

      dummyMatrix.makeTranslation(x, y, z)
      dummyMatrix.scale(new THREE.Vector3(scale, scale, scale))
      mesh.setMatrixAt(i, dummyMatrix)

      // Color by velocity with glow effect
      const color = velocityToColor(velocity)
      dummyColor.copy(color)
      mesh.setColorAt(i, dummyColor)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (streamlines.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[sphereGeometry, undefined, particleCount]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}

// ============================================================================
// Wind Field Component
// ============================================================================

export default function WindField({
  data,
  visible = true,
  streamlineCount = 1500,
  integrationSteps = 40,
  stepSize = 4.0,
  opacity = 0.85,
  arrowSize = 2.0,
  curveSegments = 8,
  animatedParticles = true,
  particleCount = 500,
  particleSpeed = 1.0,
  arrowInterval = 4,
  curvatureAwareArrows = true,
  curvatureThreshold = 0.12,
}: WindFieldProps) {

  // Generate all streamlines
  const streamlines = useMemo(() => {
    const { wind_vectors, shape, bounds, resolution } = data

    // Calculate max wind speed for normalization
    let maxSpeed = 0
    for (const vec of wind_vectors) {
      const speed = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2)
      if (speed > maxSpeed) maxSpeed = speed
    }
    maxSpeed = maxSpeed || 1

    // Generate grid-based seed points for even coverage
    // Calculate grid size to achieve target streamline count
    const gridSize = Math.ceil(Math.pow(streamlineCount, 1/3))
    const seeds = generateGridSeeds(bounds, gridSize)

    // Advect streamlines from each seed
    const lines: StreamlineData[] = []
    for (const seed of seeds) {
      const streamline = advectStreamline(
        seed,
        wind_vectors,
        shape,
        bounds,
        resolution,
        integrationSteps,
        stepSize,
        maxSpeed
      )

      if (streamline) {
        lines.push(streamline)
      }
    }

    return lines
  }, [data, streamlineCount, integrationSteps, stepSize])

  if (!visible) return null

  return (
    <group name="wind-streamlines">
      <StreamlineLines streamlines={streamlines} opacity={opacity} curveSegments={curveSegments} />
      <ArrowHeads
        streamlines={streamlines}
        arrowSize={arrowSize}
        opacity={opacity}
        arrowInterval={arrowInterval}
        curvatureAware={curvatureAwareArrows}
        curvatureThreshold={curvatureThreshold}
      />
      {animatedParticles && (
        <AnimatedStreamlineParticles
          streamlines={streamlines}
          particleCount={particleCount}
          speedMultiplier={particleSpeed}
        />
      )}
    </group>
  )
}
