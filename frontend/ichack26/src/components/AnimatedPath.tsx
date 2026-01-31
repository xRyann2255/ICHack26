/**
 * Animated Path Component
 *
 * Path that draws itself progressively, showing waypoints appearing one by one.
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
  // Calculate visible portion of path
  const { visiblePoints, currentPoint } = useMemo(() => {
    const numVisible = Math.floor(progress * path.length)
    const visible = path.slice(0, Math.max(2, numVisible))
    const current = numVisible > 0 && numVisible <= path.length
      ? path[numVisible - 1]
      : null

    return {
      visiblePoints: visible.map(p => new THREE.Vector3(p[0], p[1], p[2])),
      currentPoint: current ? new THREE.Vector3(current[0], current[1], current[2]) : null,
    }
  }, [path, progress])

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

      {/* Current exploration point (glowing sphere) */}
      {showExplorationPoint && currentPoint && (
        <group position={currentPoint}>
          {/* Inner bright sphere */}
          <mesh>
            <sphereGeometry args={[3, 16, 16]} />
            <meshBasicMaterial color={explorationColor} />
          </mesh>
          {/* Outer glow */}
          <mesh>
            <sphereGeometry args={[5, 16, 16]} />
            <meshBasicMaterial
              color={explorationColor}
              transparent
              opacity={0.3}
            />
          </mesh>
          {/* Point light for glow effect */}
          <pointLight color={explorationColor} intensity={2} distance={30} />
        </group>
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
