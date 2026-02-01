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

// ============================================================================
// Wind Field Sampling (Trilinear Interpolation)
// ============================================================================

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

  const getVec = (idx: number): THREE.Vector3 => {
    if (idx >= 0 && idx < windVectors.length) {
      const v = windVectors[idx]
      return new THREE.Vector3(v[0], v[1], v[2])
    }
    return new THREE.Vector3(0, 0, 0)
  }

  const v000 = getVec(getIndex(x0, y0, z0))
  const v100 = getVec(getIndex(x1, y0, z0))
  const v010 = getVec(getIndex(x0, y1, z0))
  const v110 = getVec(getIndex(x1, y1, z0))
  const v001 = getVec(getIndex(x0, y0, z1))
  const v101 = getVec(getIndex(x1, y0, z1))
  const v011 = getVec(getIndex(x0, y1, z1))
  const v111 = getVec(getIndex(x1, y1, z1))

  const c00 = v000.clone().lerp(v100, tx)
  const c10 = v010.clone().lerp(v110, tx)
  const c01 = v001.clone().lerp(v101, tx)
  const c11 = v011.clone().lerp(v111, tx)

  const c0 = c00.clone().lerp(c10, ty)
  const c1 = c01.clone().lerp(c11, ty)

  return c0.clone().lerp(c1, tz)
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
 */
function StreamlineLines({ streamlines, opacity, curveSegments = 5 }: StreamlineLinesProps) {
  const lines = useMemo(() => {
    return streamlines.map(({ points, velocities }) => {
      const geo = new THREE.BufferGeometry()

      // Need at least 2 points for a curve
      if (points.length < 2) {
        return null
      }

      // Create a smooth CatmullRom spline through the advected points
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)

      // Sample more points along the curve for smooth rendering
      const numSamples = Math.max(points.length * curveSegments, 10)
      const sampledPoints = curve.getPoints(numSamples)

      const positions: number[] = []
      const colors: number[] = []

      for (let i = 0; i < sampledPoints.length; i++) {
        const p = sampledPoints[i]
        positions.push(p.x, p.y, p.z)

        // Interpolate velocity for color based on position along curve
        const t = i / (sampledPoints.length - 1)
        const velocityIndex = t * (velocities.length - 1)
        const lowIdx = Math.floor(velocityIndex)
        const highIdx = Math.min(lowIdx + 1, velocities.length - 1)
        const frac = velocityIndex - lowIdx
        const interpolatedVelocity = velocities[lowIdx] * (1 - frac) + velocities[highIdx] * frac

        const color = velocityToColor(interpolatedVelocity)
        colors.push(color.r, color.g, color.b)
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: opacity,
        linewidth: 1,
      })

      return new THREE.Line(geo, material)
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
}

function ArrowHeads({ streamlines, arrowSize, opacity }: ArrowHeadsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { count, matrices, colors } = useMemo(() => {
    const numArrows = streamlines.length
    const matricesArray = new Float32Array(numArrows * 16)
    const colorsArray = new Float32Array(numArrows * 3)

    const tempMatrix = new THREE.Matrix4()
    const tempPosition = new THREE.Vector3()
    const tempQuaternion = new THREE.Quaternion()
    const tempScale = new THREE.Vector3(arrowSize, arrowSize * 1.5, arrowSize)
    const upVector = new THREE.Vector3(0, 1, 0)

    streamlines.forEach((streamline, i) => {
      const { points, velocities, direction } = streamline
      const endPoint = points[points.length - 1]
      const endVelocity = velocities[velocities.length - 1]

      tempPosition.copy(endPoint)

      // Rotate cone to point in wind direction
      if (direction.length() > 0.01) {
        tempQuaternion.setFromUnitVectors(upVector, direction)
      } else {
        tempQuaternion.identity()
      }

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      tempMatrix.toArray(matricesArray, i * 16)

      const color = velocityToColor(endVelocity)
      colorsArray[i * 3] = color.r
      colorsArray[i * 3 + 1] = color.g
      colorsArray[i * 3 + 2] = color.b
    })

    return { count: numArrows, matrices: matricesArray, colors: colorsArray }
  }, [streamlines, arrowSize])

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
  streamlineCount = 400,
  integrationSteps = 25,
  stepSize = 5.0,
  opacity = 0.85,
  arrowSize = 3.0,
  curveSegments = 5,
  animatedParticles = true,
  particleCount = 300,
  particleSpeed = 1.0,
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
      <ArrowHeads streamlines={streamlines} arrowSize={arrowSize} opacity={opacity} />
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
