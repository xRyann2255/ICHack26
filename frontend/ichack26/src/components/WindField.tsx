/**
 * Wind Field Visualization Component
 *
 * Renders wind vectors as 3D arrows using instanced meshes for performance.
 * Colors indicate wind speed (blue=slow, red=fast) or turbulence.
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WindFieldData } from '../types/api'
import { indexToPosition } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface WindFieldProps {
  data: WindFieldData
  visible?: boolean
  colorMode?: 'speed' | 'turbulence'
  arrowScale?: number
  opacity?: number
  animateFlow?: boolean
  /** Only show every Nth arrow for performance */
  displayDownsample?: number
}

// ============================================================================
// Color Utilities
// ============================================================================

/** Interpolate between colors based on value 0-1 */
function getSpeedColor(normalizedSpeed: number): THREE.Color {
  // Blue (slow) -> Cyan -> Green -> Yellow -> Red (fast)
  const color = new THREE.Color()
  if (normalizedSpeed < 0.25) {
    color.setHSL(0.6, 0.8, 0.5) // Blue
  } else if (normalizedSpeed < 0.5) {
    color.setHSL(0.5, 0.8, 0.5) // Cyan
  } else if (normalizedSpeed < 0.75) {
    color.setHSL(0.3, 0.8, 0.5) // Green-Yellow
  } else {
    color.setHSL(0.0, 0.8, 0.5) // Red
  }
  return color
}

function getTurbulenceColor(turbulence: number): THREE.Color {
  // Green (calm) -> Yellow -> Orange -> Red (turbulent)
  const color = new THREE.Color()
  const hue = 0.33 - turbulence * 0.33 // Green to Red
  color.setHSL(Math.max(0, hue), 0.8, 0.5)
  return color
}


// ============================================================================
// Wind Field Component
// ============================================================================

export default function WindField({
  data,
  visible = true,
  colorMode = 'speed',
  arrowScale = 1.0,
  opacity = 0.7,
  animateFlow = false,
  displayDownsample = 1,
}: WindFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const timeRef = useRef(0)

  // Process wind data and compute instances
  const { count, matrices, colors } = useMemo(() => {
    const { wind_vectors, turbulence, shape, bounds, resolution } = data

    // Calculate max wind speed for normalization
    let maxSpd = 0
    for (const vec of wind_vectors) {
      const speed = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2)
      if (speed > maxSpd) maxSpd = speed
    }
    maxSpd = maxSpd || 1 // Avoid division by zero

    // Filter indices based on displayDownsample
    const indices: number[] = []
    const [nx, ny, nz] = shape

    for (let iz = 0; iz < nz; iz += displayDownsample) {
      for (let iy = 0; iy < ny; iy += displayDownsample) {
        for (let ix = 0; ix < nx; ix += displayDownsample) {
          const idx = ix + iy * nx + iz * nx * ny
          if (idx < wind_vectors.length) {
            indices.push(idx)
          }
        }
      }
    }

    const numArrows = indices.length
    const matricesArray = new Float32Array(numArrows * 16)
    const colorsArray = new Float32Array(numArrows * 3)

    const tempMatrix = new THREE.Matrix4()
    const tempPosition = new THREE.Vector3()
    const tempQuaternion = new THREE.Quaternion()
    const tempScale = new THREE.Vector3()
    const upVector = new THREE.Vector3(0, 1, 0)

    indices.forEach((idx, i) => {
      const windVec = wind_vectors[idx]
      const turb = turbulence[idx] || 0

      // Get world position
      const pos = indexToPosition(idx, shape, bounds, resolution)
      tempPosition.set(pos.x, pos.y, pos.z)

      // Calculate wind direction and speed
      const windDir = new THREE.Vector3(windVec[0], windVec[1], windVec[2])
      const speed = windDir.length()
      const normalizedSpeed = speed / maxSpd

      // Scale arrow by wind speed
      const scale = arrowScale * (0.5 + normalizedSpeed * 1.5)
      tempScale.set(scale, scale * (0.5 + speed * 0.1), scale)

      // Rotate arrow to point in wind direction
      if (speed > 0.01) {
        windDir.normalize()
        tempQuaternion.setFromUnitVectors(upVector, windDir)
      } else {
        tempQuaternion.identity()
      }

      // Build transformation matrix
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
      tempMatrix.toArray(matricesArray, i * 16)

      // Set color based on mode
      const color = colorMode === 'turbulence'
        ? getTurbulenceColor(turb)
        : getSpeedColor(normalizedSpeed)

      colorsArray[i * 3] = color.r
      colorsArray[i * 3 + 1] = color.g
      colorsArray[i * 3 + 2] = color.b
    })

    return {
      count: numArrows,
      matrices: matricesArray,
      colors: colorsArray,
    }
  }, [data, colorMode, arrowScale, displayDownsample])

  // Create arrow geometry once
  const arrowGeometry = useMemo(() => {
    // Simple cone for arrow (pointing up, will be rotated)
    const geo = new THREE.ConeGeometry(0.3, 2, 6)
    geo.translate(0, 1, 0) // Move pivot to base
    return geo
  }, [])

  // Update instance matrices and colors
  useEffect(() => {
    if (!meshRef.current) return

    const mesh = meshRef.current

    // Set matrices
    const tempMatrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      tempMatrix.fromArray(matrices, i * 16)
      mesh.setMatrixAt(i, tempMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    // Set colors
    const colorAttr = new THREE.InstancedBufferAttribute(colors, 3)
    mesh.instanceColor = colorAttr

  }, [count, matrices, colors])

  // Animate flow effect (optional)
  useFrame((_, delta) => {
    if (!animateFlow || !meshRef.current) return
    timeRef.current += delta

    // Could animate arrow positions or opacity for flow effect
    // For now, just a placeholder
  })

  if (!visible || count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[arrowGeometry, undefined, count]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}
