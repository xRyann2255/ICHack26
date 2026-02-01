/**
 * Third Person Camera Component
 *
 * Camera that follows behind a drone, tracking its position and heading.
 */

import { useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { FrameData } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface ThirdPersonCameraProps {
  /** Drone position [x, y, z] */
  position: [number, number, number] | null
  /** Drone heading direction [x, y, z] */
  heading: [number, number, number] | null
  /** Distance behind drone */
  followDistance?: number
  /** Height above drone */
  followHeight?: number
  /** Smoothing factor (0-1, lower = smoother) */
  smoothing?: number
  /** Whether camera is active */
  active?: boolean
  /** Optional ref to frame data for subscription-based updates (avoids React re-renders) */
  frameRef?: MutableRefObject<FrameData | null>
}

// ============================================================================
// Component
// ============================================================================

export default function ThirdPersonCamera({
  position,
  heading,
  followDistance = 40,
  followHeight = 20,
  smoothing = 0.08,
  active = true,
  frameRef,
}: ThirdPersonCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const targetPosRef = useRef(new THREE.Vector3(300, 200, 300))
  const targetLookRef = useRef(new THREE.Vector3(0, 0, 0))

  useFrame((_, delta) => {
    if (!cameraRef.current || !active) return

    // Prefer frameRef if available (subscription-based, avoids React re-renders)
    const frame = frameRef?.current
    const pos = frame?.position || position
    const head = frame?.heading || heading

    if (!pos) return

    const dronePos = new THREE.Vector3(pos[0], pos[1], pos[2])

    // Get heading direction (default to forward if not available)
    let headingDir = new THREE.Vector3(1, 0, 0)
    if (head) {
      headingDir.set(head[0], head[1], head[2])
      if (headingDir.length() > 0.1) {
        headingDir.normalize()
      } else {
        headingDir.set(1, 0, 0)
      }
    }

    // Calculate camera offset: behind and above the drone
    // "Behind" means opposite to heading direction
    const behindOffset = headingDir.clone().multiplyScalar(-followDistance)
    behindOffset.y = followHeight // Set height

    // Target camera position
    const targetCameraPos = dronePos.clone().add(behindOffset)

    // Look at point: slightly ahead of drone
    const lookAhead = dronePos.clone().add(headingDir.clone().multiplyScalar(20))

    // Frame-rate independent exponential smoothing
    // smoothing parameter now controls the speed (higher = faster, default 0.05 -> factor ~3)
    const smoothingFactor = smoothing * 60 // Convert to a reasonable factor
    const lerpFactor = 1 - Math.exp(-smoothingFactor * delta)

    targetPosRef.current.lerp(targetCameraPos, lerpFactor)
    targetLookRef.current.lerp(lookAhead, lerpFactor)

    // Apply to camera
    cameraRef.current.position.copy(targetPosRef.current)
    cameraRef.current.lookAt(targetLookRef.current)
  })

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault={active}
      fov={60}
      near={0.1}
      far={5000}
      position={[300, 200, 300]}
    />
  )
}
