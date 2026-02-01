/**
 * Wind Field Visualization Component
 *
 * Renders wind vectors as GPU-instanced arrows.
 * Handles millions of arrows efficiently using instanced rendering.
 * Colors indicate kinetic energy using a blue-to-red heatmap.
 */

import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import type { WindFieldData } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface WindFieldProps {
  data: WindFieldData
  visible?: boolean
  /** Opacity of the arrows */
  opacity?: number
  /** Base size of arrow heads */
  arrowSize?: number
  /** Scale arrow size by velocity magnitude */
  scaleByVelocity?: boolean
  /** Minimum arrow scale when scaleByVelocity is true */
  minScale?: number
  /** Maximum arrow scale when scaleByVelocity is true */
  maxScale?: number
  /** Number of streamlines (currently unused, for API compatibility) */
  streamlineCount?: number
  /** Integration steps for streamlines (currently unused) */
  integrationSteps?: number
  /** Step size for streamlines (currently unused) */
  stepSize?: number
}

// ============================================================================
// Color Utilities
// ============================================================================

// Reusable color object to avoid allocations
const _tempColor = new THREE.Color()

// Color gradient stops for kinetic energy visualization
const KE_COLOR_GRADIENT = [
  { value: 0.0, color: new THREE.Color(0x0000ff) },  // Blue - Low energy
  { value: 0.6, color: new THREE.Color(0x0000ff) },  // Green
  { value: 0.8, color: new THREE.Color(0x00ff00) },  // Yellow
  { value: 1.0, color: new THREE.Color(0xff0000) },  // Red - High energy
] as const

/**
 * Get color from kinetic energy gradient
 * @param normalizedKE - Kinetic energy normalized to 0-1 range
 */
function kineticEnergyToColor(normalizedKE: number): THREE.Color {
  // Apply inverse log scale to spread out low values
  // This helps visualize the distribution when there are many low KE values

  // Use a stronger log scale to weight more towards blue
  // Square root before log makes the scale even more weighted towards low values
  const sqrtValue = Math.sqrt(normalizedKE)
  const logValue = Math.log10(sqrtValue * 99 + 1) / 2.15 // log10(1) = 0, log10(100) / 2 = 1
  const t = Math.max(0, Math.min(1, logValue))

  // Find the two gradient stops to interpolate between
  for (let i = 0; i < KE_COLOR_GRADIENT.length - 1; i++) {
    const stop1 = KE_COLOR_GRADIENT[i]
    const stop2 = KE_COLOR_GRADIENT[i + 1]

    if (t >= stop1.value && t <= stop2.value) {
      // Interpolate between the two colors
      const localT = (t - stop1.value) / (stop2.value - stop1.value)
      const color = new THREE.Color()
      color.lerpColors(stop1.color, stop2.color, localT)
      return color
    }
  }

  // Fallback to last color if beyond range
  return KE_COLOR_GRADIENT[KE_COLOR_GRADIENT.length - 1].color.clone()
}

// ============================================================================
// GPU-Instanced Arrow Field
// ============================================================================

export default function WindField({
  data,
  visible = true,
  opacity = 0.25,
  arrowSize = 2.0,
  scaleByVelocity = true,
  minScale = 0.5,
  maxScale = 2.0,
}: WindFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  // Process wind data and create matrices and colors
  const { count, matrices, colors } = useMemo(() => {
    const { points, velocity, ke } = data

    // Validate data
    if (!points || !velocity || !ke || points.length === 0 || velocity.length === 0 || ke.length === 0) {
      console.warn('WindField: No wind data available')
      return { count: 0, matrices: new Float32Array(0), colors: new Float32Array(0) }
    }

    if (points.length !== velocity.length || points.length !== ke.length) {
      console.error('WindField: Points, velocity, and ke arrays must have same length')
      return { count: 0, matrices: new Float32Array(0), colors: new Float32Array(0) }
    }

    const numArrows = points.length

    // Calculate max kinetic energy for normalization
    let maxKE = 0
    for (const energy of ke) {
      if (energy > maxKE) maxKE = energy
    }
    maxKE = Math.min(maxKE || 1, 1)

    // Also calculate velocity stats for scaling
    let maxVelocity = 0
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity

    for (let i = 0; i < numArrows; i++) {
      const [vx, vy, vz] = velocity[i]
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (speed > maxVelocity) maxVelocity = speed

      const [px, py, pz] = points[i]
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      if (pz < minZ) minZ = pz
      if (pz > maxZ) maxZ = pz
    }
    console.log(`WindField: Rendering ${numArrows} arrows (max velocity: ${maxVelocity.toFixed(2)} m/s, max KE: ${maxKE.toFixed(2)})`)
    console.log('WindField bounds:', {
      x: [minX.toFixed(1), maxX.toFixed(1)],
      y: [minY.toFixed(1), maxY.toFixed(1)],
      z: [minZ.toFixed(1), maxZ.toFixed(1)]
    })
    console.log('WindField center:', {
      x: ((minX + maxX) / 2).toFixed(1),
      y: ((minY + maxY) / 2).toFixed(1),
      z: ((minZ + maxZ) / 2).toFixed(1)
    })

    // Prepare instance data
    const matricesArray = new Float32Array(numArrows * 16)
    const colorsArray = new Float32Array(numArrows * 3)

    // Reusable objects to avoid allocations in loop
    const tempMatrix = new THREE.Matrix4()
    const tempQuaternion = new THREE.Quaternion()
    const tempScale = new THREE.Vector3()
    const tempPosition = new THREE.Vector3()
    const upVector = new THREE.Vector3(0, 1, 0)
    const direction = new THREE.Vector3()

    for (let i = 0; i < numArrows; i++) {
      const [px, py, pz] = points[i]
      const [vx, vy, vz] = velocity[i]
      const kineticEnergy = ke[i]

      // Calculate velocity magnitude
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      const normalizedSpeed = speed / maxVelocity
      const normalizedKE = kineticEnergy / maxKE

      // Skip arrows with near-zero velocity
      if (speed < 0.001) {
        // Set invisible by scaling to zero - write identity-like matrix with zero scale
        matricesArray[i * 16] = 0      // scale x
        matricesArray[i * 16 + 5] = 0  // scale y
        matricesArray[i * 16 + 10] = 0 // scale z
        matricesArray[i * 16 + 15] = 1 // w
        colorsArray[i * 3] = 0
        colorsArray[i * 3 + 1] = 0
        colorsArray[i * 3 + 2] = 0
        continue
      }

      // Calculate arrow direction
      direction.set(vx, vy, vz).normalize()

      // Calculate rotation to align arrow with velocity direction
      if (direction.lengthSq() > 0.01) {
        tempQuaternion.setFromUnitVectors(upVector, direction)
      } else {
        tempQuaternion.identity()
      }

      // Calculate scale based on velocity if enabled
      let scale = arrowSize
      if (scaleByVelocity) {
        scale = arrowSize * (minScale + normalizedSpeed * (maxScale - minScale))
      }

      // Scale the length (Y axis) based on kinetic energy
      // Higher KE = longer arrows
      const keScale = Math.min(minScale + normalizedKE * (maxScale - minScale), maxScale)
      tempScale.set(scale, scale * 1.5 * keScale, scale)

      // Set position
      tempPosition.set(px, py, pz)

      // Compose transformation matrix
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      tempMatrix.toArray(matricesArray, i * 16)

      // Set color based on kinetic energy
      const color = kineticEnergyToColor(normalizedKE)
      colorsArray[i * 3] = color.r
      colorsArray[i * 3 + 1] = color.g
      colorsArray[i * 3 + 2] = color.b
    }

    return { count: numArrows, matrices: matricesArray, colors: colorsArray }
  }, [data, arrowSize, scaleByVelocity, minScale, maxScale])

  // Create cone geometry for arrows (pointing up in local space)
  const coneGeometry = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.4, 1.2, 8)
    geo.translate(0, 0.6, 0) // Move pivot to base
    return geo
  }, [])

  // Apply matrices and colors to instanced mesh via direct buffer copy
  useEffect(() => {
    if (!meshRef.current || count === 0) return

    const mesh = meshRef.current

      // Direct buffer copy - O(1) instead of O(n) iterations
      ; (mesh.instanceMatrix.array as Float32Array).set(matrices)
    mesh.instanceMatrix.needsUpdate = true

    // Set all instance colors
    const colorAttr = new THREE.InstancedBufferAttribute(colors, 3)
    mesh.instanceColor = colorAttr

    console.log(`WindField: Applied ${count} instances with colors`)
  }, [count, matrices, colors])

  if (!visible || count === 0) return null

  // Custom shader material to handle per-instance colors
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vColor;
        
        void main() {
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif
          
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying vec3 vColor;
        
        void main() {
          gl_FragColor = vec4(vColor, opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      uniforms: {
        opacity: { value: opacity }
      }
    })
  }, [opacity])

  return (
    <group name="wind-field">
      <instancedMesh
        ref={meshRef}
        args={[coneGeometry, material, count]}
        frustumCulled={false}
      />
    </group>
  )
}
