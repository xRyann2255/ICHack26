/**
 * Smooth Camera Component
 *
 * Provides smooth camera transitions between different viewpoints
 * and follow modes for cinematic effects.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

export interface CameraTarget {
  position: THREE.Vector3 | [number, number, number]
  lookAt: THREE.Vector3 | [number, number, number]
}

export interface SmoothCameraProps {
  /** Target camera position and look-at point */
  target?: CameraTarget
  /** Transition duration in seconds */
  duration?: number
  /** Easing function type */
  easing?: 'linear' | 'easeInOut' | 'easeOut' | 'easeIn'
  /** Enable smooth transitions */
  enabled?: boolean
  /** Callback when transition completes */
  onTransitionComplete?: () => void
}

// ============================================================================
// Easing Functions
// ============================================================================

const easingFunctions = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
}

// ============================================================================
// Main Component
// ============================================================================

export default function SmoothCamera({
  target,
  duration = 2,
  easing = 'easeInOut',
  enabled = true,
  onTransitionComplete,
}: SmoothCameraProps) {
  const { camera } = useThree()
  const transitionRef = useRef({
    active: false,
    startTime: 0,
    startPosition: new THREE.Vector3(),
    endPosition: new THREE.Vector3(),
    startLookAt: new THREE.Vector3(),
    endLookAt: new THREE.Vector3(),
    currentLookAt: new THREE.Vector3(),
  })

  // Start transition when target changes
  useEffect(() => {
    if (!target || !enabled) return

    const t = transitionRef.current
    t.active = true
    t.startTime = -1 // Will be set on first frame
    t.startPosition.copy(camera.position)
    t.endPosition.set(
      ...(Array.isArray(target.position) ? target.position : target.position.toArray()) as [number, number, number]
    )

    // Calculate current look-at point from camera direction
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    t.startLookAt.copy(camera.position).add(direction.multiplyScalar(100))

    t.endLookAt.set(
      ...(Array.isArray(target.lookAt) ? target.lookAt : target.lookAt.toArray()) as [number, number, number]
    )
  }, [target, enabled, camera])

  useFrame((state) => {
    const t = transitionRef.current
    if (!t.active) return

    // Initialize start time on first frame
    if (t.startTime < 0) {
      t.startTime = state.clock.elapsedTime
    }

    const elapsed = state.clock.elapsedTime - t.startTime
    const rawProgress = Math.min(elapsed / duration, 1)
    const progress = easingFunctions[easing](rawProgress)

    // Interpolate position
    camera.position.lerpVectors(t.startPosition, t.endPosition, progress)

    // Interpolate look-at
    t.currentLookAt.lerpVectors(t.startLookAt, t.endLookAt, progress)
    camera.lookAt(t.currentLookAt)

    // Check if transition complete
    if (rawProgress >= 1) {
      t.active = false
      onTransitionComplete?.()
    }
  })

  return null
}

// ============================================================================
// Follow Camera Component
// ============================================================================

export interface FollowCameraProps {
  /** Target position to follow */
  target: THREE.Vector3 | [number, number, number] | null
  /** Target heading/direction for orientation */
  heading?: THREE.Vector3 | [number, number, number]
  /** Distance behind target */
  followDistance?: number
  /** Height above target */
  followHeight?: number
  /** Smoothing factor (0-1, lower = smoother) */
  smoothing?: number
  /** Look ahead distance */
  lookAhead?: number
  /** Enable following */
  enabled?: boolean
}

export function FollowCamera({
  target,
  heading,
  followDistance = 30,
  followHeight = 15,
  smoothing = 0.05,
  lookAhead = 10,
  enabled = true,
}: FollowCameraProps) {
  const { camera } = useThree()
  const _targetPositionRef = useRef(new THREE.Vector3()); void _targetPositionRef;
  const currentLookAtRef = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!target || !enabled) return

    // Get target position
    const targetPos = target instanceof THREE.Vector3
      ? target
      : new THREE.Vector3(...target)

    // Get heading direction
    const headingDir = heading
      ? (heading instanceof THREE.Vector3 ? heading.clone() : new THREE.Vector3(...heading)).normalize()
      : new THREE.Vector3(0, 0, 1)

    // Calculate ideal camera position (behind and above target)
    const offset = headingDir.clone().multiplyScalar(-followDistance)
    offset.y = followHeight

    const idealPosition = targetPos.clone().add(offset)

    // Smooth camera position
    camera.position.lerp(idealPosition, smoothing)

    // Calculate look-at point (ahead of target)
    const lookAtPoint = targetPos.clone().add(headingDir.multiplyScalar(lookAhead))
    currentLookAtRef.current.lerp(lookAtPoint, smoothing)
    camera.lookAt(currentLookAtRef.current)
  })

  return null
}

// ============================================================================
// Orbit Animation Component
// ============================================================================

export interface OrbitAnimationProps {
  /** Center point to orbit around */
  center?: THREE.Vector3 | [number, number, number]
  /** Orbit radius */
  radius?: number
  /** Orbit height */
  height?: number
  /** Rotation speed (radians per second) */
  speed?: number
  /** Enable orbit animation */
  enabled?: boolean
}

export function OrbitAnimation({
  center = [0, 0, 0],
  radius = 200,
  height = 100,
  speed = 0.1,
  enabled = true,
}: OrbitAnimationProps) {
  const { camera } = useThree()

  const centerVec = useRef(
    center instanceof THREE.Vector3 ? center : new THREE.Vector3(...center)
  )

  useFrame((state) => {
    if (!enabled) return

    const time = state.clock.elapsedTime * speed
    const x = centerVec.current.x + Math.cos(time) * radius
    const z = centerVec.current.z + Math.sin(time) * radius
    const y = centerVec.current.y + height

    camera.position.set(x, y, z)
    camera.lookAt(centerVec.current)
  })

  return null
}

// ============================================================================
// Cinematic Camera Sequence
// ============================================================================

export interface CameraKeyframe {
  position: [number, number, number]
  lookAt: [number, number, number]
  duration: number
}

export interface CinematicSequenceProps {
  /** Array of camera keyframes */
  keyframes: CameraKeyframe[]
  /** Loop the sequence */
  loop?: boolean
  /** Enable the sequence */
  enabled?: boolean
  /** Callback when sequence completes (if not looping) */
  onComplete?: () => void
}

export function CinematicSequence({
  keyframes,
  loop = false,
  enabled = true,
  onComplete,
}: CinematicSequenceProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const currentTarget = keyframes[currentIndex]

  const handleTransitionComplete = useCallback(() => {
    if (currentIndex < keyframes.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else if (loop) {
      setCurrentIndex(0)
    } else {
      setIsComplete(true)
      onComplete?.()
    }
  }, [currentIndex, keyframes.length, loop, onComplete])

  // Reset on keyframes change
  useEffect(() => {
    setCurrentIndex(0)
    setIsComplete(false)
  }, [keyframes])

  if (!enabled || isComplete || !currentTarget) return null

  return (
    <SmoothCamera
      target={{
        position: currentTarget.position,
        lookAt: currentTarget.lookAt,
      }}
      duration={currentTarget.duration}
      easing="easeInOut"
      onTransitionComplete={handleTransitionComplete}
    />
  )
}
