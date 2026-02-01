import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import { useMemo } from 'react'

interface TerrainProps {
  url?: string
  color?: string
  scale?: number
  onBoundsComputed?: (bounds: { min: number[]; max: number[] }) => void
  onClick?: (event: { point: THREE.Vector3; stopPropagation: () => void }) => void
  onPointerOver?: () => void
  onPointerOut?: () => void
}

/**
 * Terrain component that loads an STL file and renders it.
 *
 * IMPORTANT: This must match the backend's coordinate transformation!
 * Backend does: STL (x, y, z) → Backend (x, z, -y)
 * Frontend does: STL (x, y, z) → rotate -90° around X → (x, z, -y)
 *
 * Both center X and Z, and ground Y at 0.
 */
function Terrain({
  url = '/models/southken.stl',
  color = '#667788',
  scale = 1,
  onBoundsComputed,
  onClick,
  onPointerOver,
  onPointerOut
}: TerrainProps) {
  // Load the STL geometry
  const geometry = useLoader(STLLoader, url)

  // Transform the geometry to match backend's coordinate system
  const { transformedGeometry, bounds } = useMemo(() => {
    const geo = geometry.clone()
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)

    // Backend transformation:
    // 1. STL (x, y, z) → (x, z, -y)  [via rotation]
    // 2. Center X and Z (which is -Y after rotation)
    // 3. Ground Y at 0 (which is Z after rotation)

    // We achieve this by:
    // 1. Center STL X and Y (before rotation)
    // 2. Ground STL Z at 0 (before rotation)
    // 3. Apply -90° X rotation

    // STL bounds before rotation:
    // X: box.min.x to box.max.x (will stay X)
    // Y: box.min.y to box.max.y (will become -Z)
    // Z: box.min.z to box.max.z (will become Y/height)

    // Center X, center Y (which becomes -Z), ground Z (which becomes Y)
    geo.translate(-center.x, -center.y, -box.min.z)

    // After rotation -90° around X:
    // - STL X → Three.js X (centered)
    // - STL Z → Three.js Y (grounded at 0)
    // - STL Y → Three.js -Z (centered, negated)

    // Compute bounds in Three.js coordinates (after rotation)
    const computedBounds = {
      min: [
        (box.min.x - center.x) * scale,           // X: centered
        0,                                         // Y: grounded
        -(box.max.y - center.y) * scale           // Z: centered, negated (min becomes -max)
      ],
      max: [
        (box.max.x - center.x) * scale,           // X: centered
        (box.max.z - box.min.z) * scale,          // Y: height
        -(box.min.y - center.y) * scale           // Z: centered, negated (max becomes -min)
      ]
    }

    // Notify parent of bounds if callback provided
    if (onBoundsComputed) {
      onBoundsComputed(computedBounds)
    }

    return {
      transformedGeometry: geo,
      bounds: computedBounds
    }
  }, [geometry, scale, onBoundsComputed])

  // Log bounds for debugging
  useMemo(() => {
    console.log('Terrain bounds (Three.js coords):', bounds)
    console.log('Terrain size:', {
      x: bounds.max[0] - bounds.min[0],
      y: bounds.max[1] - bounds.min[1],
      z: bounds.max[2] - bounds.min[2]
    })
  }, [bounds])

  return (
    <mesh
      geometry={transformedGeometry}
      scale={[scale, scale, scale]}
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <meshStandardMaterial
        color={color}
        flatShading
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default Terrain
