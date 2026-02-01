/**
 * Wind Field Visualization Component
 *
 * Renders wind vectors as GPU-instanced arrows.
 * Handles millions of arrows efficiently using instanced rendering.
 * Colors indicate velocity magnitude using a blue-to-red heatmap.
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

  // Process wind data and create 2 matrices
  const { count, matrices, colors } = useMemo(() => {
    const { points, velocity } = data

    // Validate data
    if (!points || !velocity || points.length === 0 || velocity.length === 0) {
      console.warn('WindField: No wind data available')
      return { count: 0, matrices: new Float32Array(0), colors: new Float32Array(0) }
    }

    if (points.length !== velocity.length) {
      console.error('WindField: Points and velocity arrays must have same length')
      return { count: 0, matrices: new Float32Array(0), colors: new Float32Array(0) }
    }

    const numArrows = points.length

    // Calculate max velocity for normalization
    let maxVelocity = 0
    for (const vel of velocity) {
      const [vx, vy, vz] = vel
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (speed > maxVelocity) maxVelocity = speed
    }
    maxVelocity = maxVelocity || 1

    console.log(`WindField: Rendering ${numArrows} arrows (max velocity: ${maxVelocity.toFixed(2)} m/s)`)

    // Prepare instance data
    const matricesArray = new Float32Array(numArrows * 16)
    const colorsArray = new Float32Array(numArrows * 3)

    const tempMatrix = new THREE.Matrix4()
    const tempQuaternion = new THREE.Quaternion()
    const tempScale = new THREE.Vector3()
    const upVector = new THREE.Vector3(0, 1, 0)
    const direction = new THREE.Vector3()

    for (let i = 0; i < numArrows; i++) {
      const [px, py, pz] = points[i]
      const [vx, vy, vz] = velocity[i]

      // Calculate velocity magnitude
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      const normalizedSpeed = speed / maxVelocity

      // Skip arrows with near-zero velocity
      if (speed < 0.001) {
        // Set invisible by scaling to zero
        tempMatrix.makeScale(0, 0, 0)
        tempMatrix.toArray(matricesArray, i * 16)
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
      tempScale.set(scale, scale * 1.5, scale)

      // Compose transformation matrix
      tempMatrix.compose(
        new THREE.Vector3(px, py, pz),
        tempQuaternion,
        tempScale
      )
      tempMatrix.toArray(matricesArray, i * 16)

      // Set color based on velocity magnitude
      const color = velocityToColor(normalizedSpeed)
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

  // Apply matrices and colors to instanced mesh
  useEffect(() => {
    if (!meshRef.current || count === 0) return

    const mesh = meshRef.current
    const tempMatrix = new THREE.Matrix4()

    // Set all instance matrices
    for (let i = 0; i < count; i++) {
      tempMatrix.fromArray(matrices, i * 16)
      mesh.setMatrixAt(i, tempMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    // Set all instance colors
    const colorAttr = new THREE.InstancedBufferAttribute(colors, 3)
    mesh.instanceColor = colorAttr
  }, [count, matrices, colors])

  if (!visible || count === 0) return null

  return (
    <group name="wind-field">
      <instancedMesh
        ref={meshRef}
        args={[coneGeometry, undefined, count]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  )
}
