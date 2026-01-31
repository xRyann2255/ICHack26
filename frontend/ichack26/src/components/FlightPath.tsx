/**
 * Flight Path Visualization Component
 *
 * Renders drone flight paths as 3D lines with optional animation.
 */

import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

export interface FlightPathProps {
  /** Array of [x, y, z] waypoints */
  path: [number, number, number][]
  /** Path color */
  color?: string
  /** Line width */
  lineWidth?: number
  /** Whether path is visible */
  visible?: boolean
  /** Opacity (0-1) */
  opacity?: number
  /** Show path as dashed line */
  dashed?: boolean
  /** Dash scale (if dashed) */
  dashScale?: number
  /** Show waypoint markers */
  showWaypoints?: boolean
  /** Waypoint marker size */
  waypointSize?: number
}

// ============================================================================
// Path Colors
// ============================================================================

export const PATH_COLORS = {
  naive: '#ff6b6b',      // Red/coral for naive route
  optimized: '#4ecdc4',  // Teal/cyan for optimized route
  highlight: '#ffd93d',  // Yellow for highlights
} as const

// ============================================================================
// Flight Path Component
// ============================================================================

export default function FlightPath({
  path,
  color = PATH_COLORS.naive,
  lineWidth = 3,
  visible = true,
  opacity = 1,
  dashed = false,
  dashScale = 1,
  showWaypoints = false,
  waypointSize = 1,
}: FlightPathProps) {
  // Convert path to THREE.Vector3 points
  const points = useMemo(() => {
    return path.map(p => new THREE.Vector3(p[0], p[1], p[2]))
  }, [path])

  if (!visible || points.length < 2) return null

  return (
    <group>
      {/* Main path line */}
      <Line
        points={points}
        color={color}
        lineWidth={lineWidth}
        transparent={opacity < 1}
        opacity={opacity}
        dashed={dashed}
        dashScale={dashScale}
        dashSize={dashed ? 3 : undefined}
        gapSize={dashed ? 1 : undefined}
      />

      {/* Waypoint markers */}
      {showWaypoints && points.map((point, i) => (
        <mesh key={i} position={point}>
          <sphereGeometry args={[waypointSize, 8, 8]} />
          <meshBasicMaterial
            color={i === 0 ? '#00ff00' : i === points.length - 1 ? '#ff0000' : color}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}

      {/* Start marker */}
      {points.length > 0 && (
        <mesh position={points[0]}>
          <sphereGeometry args={[waypointSize * 1.5, 16, 16]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      )}

      {/* End marker */}
      {points.length > 1 && (
        <mesh position={points[points.length - 1]}>
          <sphereGeometry args={[waypointSize * 1.5, 16, 16]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      )}
    </group>
  )
}

// ============================================================================
// Dual Path Component (for side-by-side comparison)
// ============================================================================

export interface DualPathsProps {
  naivePath?: [number, number, number][]
  optimizedPath?: [number, number, number][]
  showNaive?: boolean
  showOptimized?: boolean
  lineWidth?: number
  showWaypoints?: boolean
}

export function DualPaths({
  naivePath,
  optimizedPath,
  showNaive = true,
  showOptimized = true,
  lineWidth = 3,
  showWaypoints = false,
}: DualPathsProps) {
  return (
    <group>
      {naivePath && showNaive && (
        <FlightPath
          path={naivePath}
          color={PATH_COLORS.naive}
          lineWidth={lineWidth}
          showWaypoints={showWaypoints}
          dashed={true}
          dashScale={2}
        />
      )}
      {optimizedPath && showOptimized && (
        <FlightPath
          path={optimizedPath}
          color={PATH_COLORS.optimized}
          lineWidth={lineWidth}
          showWaypoints={showWaypoints}
        />
      )}
    </group>
  )
}
