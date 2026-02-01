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

/**
 * Get heatmap color from blue (low) to red (high)
 * Writes to the provided output array to avoid allocations
 */
function velocityToColorRGB(normalizedVelocity: number, out: Float32Array, offset: number): void {
  const t = Math.max(0, Math.min(1, normalizedVelocity))

  // HSL interpolation: Blue (0.66) -> Cyan -> Green -> Yellow -> Red (0.0)
  const hue = 0.66 * (1 - t)
  const saturation = 0.9
  const lightness = 0.55

  _tempColor.setHSL(hue, saturation, lightness)
  out[offset] = _tempColor.r
  out[offset + 1] = _tempColor.g
  out[offset + 2] = _tempColor.b
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

  // Process wind data and create matrices + colors
  const { count, matrices, colors, boundingSphere } = useMemo(() => {
    const { points, velocity } = data

    // Validate data
    if (!points || !velocity || points.length === 0 || velocity.length === 0) {
      return { count: 0, matrices: new Float32Array(0), colors: new Float32Array(0), boundingSphere: null }
    }

    if (points.length !== velocity.length) {
      console.error('WindField: Points and velocity arrays must have same length')
      return { count: 0, matrices: new Float32Array(0), colors: new Float32Array(0), boundingSphere: null }
    }

    const numArrows = points.length

    // Calculate max velocity for normalization and bounds for bounding sphere
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
    maxVelocity = maxVelocity || 1

    // Compute bounding sphere for frustum culling
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2
    const radius = Math.sqrt(
      Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2) + Math.pow(maxZ - minZ, 2)
    ) / 2 + arrowSize * maxScale * 2 // Add padding for arrow size

    const sphere = new THREE.Sphere(new THREE.Vector3(centerX, centerY, centerZ), radius)

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

      // Calculate velocity magnitude
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      const normalizedSpeed = speed / maxVelocity

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
      tempScale.set(scale, scale * 1.5, scale)
      tempPosition.set(px, py, pz)

      // Compose transformation matrix (reusing tempPosition instead of new Vector3)
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      tempMatrix.toArray(matricesArray, i * 16)

      // Set color based on velocity magnitude (writes directly to array)
      velocityToColorRGB(normalizedSpeed, colorsArray, i * 3)
    }

    return { count: numArrows, matrices: matricesArray, colors: colorsArray, boundingSphere: sphere }
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
    ;(mesh.instanceMatrix.array as Float32Array).set(matrices)
    mesh.instanceMatrix.needsUpdate = true

    // Reuse existing color attribute or create new one
    if (mesh.instanceColor && mesh.instanceColor.count === count) {
      ;(mesh.instanceColor.array as Float32Array).set(colors)
      mesh.instanceColor.needsUpdate = true
    } else {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
    }

    // Set bounding sphere for proper frustum culling
    if (boundingSphere) {
      mesh.geometry.boundingSphere = boundingSphere
    }
  }, [count, matrices, colors, boundingSphere])

  if (!visible || count === 0) return null

  return (
    <group name="wind-field">
      <instancedMesh
        ref={meshRef}
        args={[coneGeometry, undefined, count]}
        frustumCulled={true}
      >
        <meshBasicMaterial
          vertexColors={true}
          transparent={true}
          opacity={opacity}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  )
}
