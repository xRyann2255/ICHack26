import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import { useMemo } from 'react'

interface TerrainProps {
  url?: string
  color?: string
  scale?: number
  onBoundsComputed?: (bounds: { min: number[]; max: number[] }) => void
}

function Terrain({
  url = '/models/southken.stl',
  color = '#667788',
  scale = 1,
  onBoundsComputed
}: TerrainProps) {
  // Load the STL geometry
  const geometry = useLoader(STLLoader, url)

  // Center the geometry and compute bounds
  const { centeredGeometry, bounds } = useMemo(() => {
    const geo = geometry.clone()
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)

    // Center the geometry at origin (X/Y), keep Z at ground level
    geo.translate(-center.x, -center.y, -box.min.z)

    const computedBounds = {
      min: [
        (box.min.x - center.x) * scale,
        (box.min.y - center.y) * scale,
        0
      ],
      max: [
        (box.max.x - center.x) * scale,
        (box.max.y - center.y) * scale,
        (box.max.z - box.min.z) * scale
      ]
    }

    // Notify parent of bounds if callback provided
    if (onBoundsComputed) {
      onBoundsComputed(computedBounds)
    }

    return {
      centeredGeometry: geo,
      bounds: computedBounds
    }
  }, [geometry, scale, onBoundsComputed])

  // Log bounds for debugging
  useMemo(() => {
    console.log('Terrain bounds:', bounds)
    console.log('Terrain size:', {
      x: bounds.max[0] - bounds.min[0],
      y: bounds.max[1] - bounds.min[1],
      z: bounds.max[2] - bounds.min[2]
    })
  }, [bounds])

  return (
    <mesh
      geometry={centeredGeometry}
      scale={[scale, scale, scale]}
      castShadow
      receiveShadow
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
