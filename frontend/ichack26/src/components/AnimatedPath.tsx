/**
 * Animated Path Component
 *
 * Path that draws itself progressively with smooth interpolation between waypoints.
 */

import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

export interface AnimatedPathProps {
  /** Full path waypoints */
  path: [number, number, number][]
  /** Progress 0-1 (how much of path to show) */
  progress: number
  /** Path color */
  color: string
  /** Line width */
  lineWidth?: number
  /** Show exploration point at current position */
  showExplorationPoint?: boolean
  /** Exploration point color */
  explorationColor?: string
}

// ============================================================================
// Exploration Point Component (synced exactly to line front)
// ============================================================================

interface ExplorationPointProps {
  /** Position at the front of the line */
  position: THREE.Vector3
  color: string
}

function ExplorationPoint({ position, color }: ExplorationPointProps) {
  return (
    <group position={position}>
      {/* Inner bright sphere */}
      <mesh>
        <sphereGeometry args={[3, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* Point light for glow effect */}
      <pointLight color={color} intensity={2} distance={30} />
    </group>
  )
}

// ============================================================================
// Component
// ============================================================================

export default function AnimatedPath({
  path,
  progress,
  color,
  lineWidth = 4,
  showExplorationPoint = true,
  explorationColor = '#ffd93d',
}: AnimatedPathProps) {
  // Convert path to Vector3 array once
  const pathVectors = useMemo(() =>
    path.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    [path]
  )

  // Calculate visible portion of path with smooth interpolation
  const visiblePoints = useMemo(() => {
    if (pathVectors.length < 2) return []

    // Get the number of complete segments plus the partial one
    const totalSegments = pathVectors.length - 1
    const exactIndex = progress * totalSegments
    const lastCompleteIndex = Math.floor(exactIndex)
    const segmentT = exactIndex - lastCompleteIndex

    // Build visible points array
    const points: THREE.Vector3[] = []

    // Add all complete waypoints
    for (let i = 0; i <= lastCompleteIndex && i < pathVectors.length; i++) {
      points.push(pathVectors[i].clone())
    }

    // Add interpolated endpoint if we're partway through a segment
    if (segmentT > 0.001 && lastCompleteIndex < totalSegments) {
      const interpolated = new THREE.Vector3()
      interpolated.lerpVectors(
        pathVectors[lastCompleteIndex],
        pathVectors[lastCompleteIndex + 1],
        segmentT
      )
      points.push(interpolated)
    }

    return points
  }, [pathVectors, progress])

  if (visiblePoints.length < 2) return null

  return (
    <group>
      {/* Drawn path */}
      <Line
        points={visiblePoints}
        color={color}
        lineWidth={lineWidth}
        transparent
        opacity={0.9}
      />

      {/* Exploration point - always at the exact front of the line */}
      {showExplorationPoint && visiblePoints.length >= 2 && (
        <ExplorationPoint
          position={visiblePoints[visiblePoints.length - 1]}
          color={explorationColor}
        />
      )}

      {/* Start point marker */}
      {visiblePoints.length > 0 && (
        <mesh position={visiblePoints[0]}>
          <sphereGeometry args={[4, 16, 16]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      )}
    </group>
  )
}
