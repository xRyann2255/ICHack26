/**
 * Particle Trail Component
 *
 * Creates an animated particle trail effect that follows
 * a moving object (like a drone). Uses instanced meshes
 * for performance.
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

export interface ParticleTrailProps {
  /** Current position to emit from */
  position: THREE.Vector3 | null
  /** Base color of particles */
  color?: string | THREE.Color
  /** Maximum number of particles */
  maxParticles?: number
  /** Particle lifetime in seconds */
  lifetime?: number
  /** Emission rate (particles per second) */
  emissionRate?: number
  /** Initial particle size */
  particleSize?: number
  /** Size decay rate */
  sizeDecay?: number
  /** Opacity decay rate */
  opacityDecay?: number
  /** Spread velocity (how much particles disperse) */
  spread?: number
  /** Whether the trail is active */
  active?: boolean
  /** Intensity multiplier (e.g., based on effort) */
  intensity?: number
}

// ============================================================================
// Particle System
// ============================================================================

interface Particle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  maxAge: number
  size: number
  opacity: number
}

export default function ParticleTrail({
  position,
  color = '#4ecdc4',
  maxParticles = 100,
  lifetime = 1.5,
  emissionRate = 30,
  particleSize = 0.8,
  sizeDecay = 0.5,
  opacityDecay = 0.8,
  spread = 0.5,
  active = true,
  intensity = 1,
}: ParticleTrailProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const particlesRef = useRef<Particle[]>([])
  const lastEmitTimeRef = useRef(0)
  const dummyMatrix = useMemo(() => new THREE.Matrix4(), [])
  const dummyColor = useMemo(() => new THREE.Color(), [])

  // Initialize particles array
  useEffect(() => {
    particlesRef.current = []
  }, [maxParticles])

  // Base color
  const baseColor = useMemo(() => {
    return color instanceof THREE.Color ? color : new THREE.Color(color)
  }, [color])

  useFrame((state, delta) => {
    if (!meshRef.current || !position || !active) return

    const now = state.clock.elapsedTime
    const particles = particlesRef.current

    // Emit new particles based on emission rate
    const emitInterval = 1 / (emissionRate * intensity)
    if (now - lastEmitTimeRef.current > emitInterval && particles.length < maxParticles) {
      // Create new particle
      const particle: Particle = {
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread
        ),
        age: 0,
        maxAge: lifetime * (0.8 + Math.random() * 0.4), // Slight variation
        size: particleSize * (0.8 + Math.random() * 0.4) * intensity,
        opacity: 1,
      }
      particles.push(particle)
      lastEmitTimeRef.current = now
    }

    // Update existing particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.age += delta

      if (p.age >= p.maxAge) {
        // Remove dead particle
        particles.splice(i, 1)
        continue
      }

      // Update position
      p.position.add(p.velocity.clone().multiplyScalar(delta))

      // Add slight upward drift
      p.position.y += delta * 0.2

      // Update size and opacity based on age
      const ageRatio = p.age / p.maxAge
      p.size = particleSize * intensity * (1 - ageRatio * sizeDecay)
      p.opacity = 1 - ageRatio * opacityDecay
    }

    // Update instanced mesh
    const mesh = meshRef.current

    // Hide all instances first
    for (let i = 0; i < maxParticles; i++) {
      dummyMatrix.makeScale(0, 0, 0)
      mesh.setMatrixAt(i, dummyMatrix)
    }

    // Position visible particles
    particles.forEach((p, i) => {
      dummyMatrix.makeTranslation(p.position.x, p.position.y, p.position.z)
      dummyMatrix.scale(new THREE.Vector3(p.size, p.size, p.size))
      mesh.setMatrixAt(i, dummyMatrix)

      // Color with opacity variation
      dummyColor.copy(baseColor)
      dummyColor.multiplyScalar(0.5 + p.opacity * 0.5)
      mesh.setColorAt(i, dummyColor)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, maxParticles]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial
        color={baseColor}
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}

// ============================================================================
// Glow Particle Trail (enhanced version with glow)
// ============================================================================

export interface GlowTrailProps extends ParticleTrailProps {
  /** Glow intensity */
  glowIntensity?: number
  /** Glow size multiplier */
  glowSize?: number
}

export function GlowTrail({
  glowIntensity = 1,
  glowSize = 2,
  ...props
}: GlowTrailProps) {
  return (
    <group>
      {/* Core particles */}
      <ParticleTrail {...props} />

      {/* Glow particles (larger, more transparent) */}
      <ParticleTrail
        {...props}
        particleSize={(props.particleSize || 0.8) * glowSize}
        maxParticles={Math.floor((props.maxParticles || 100) * 0.5)}
        emissionRate={(props.emissionRate || 30) * 0.5}
        intensity={(props.intensity || 1) * glowIntensity * 0.3}
      />
    </group>
  )
}

// ============================================================================
// Spark Trail (for high-effort situations)
// ============================================================================

export interface SparkTrailProps {
  position: THREE.Vector3 | null
  effort: number // 0-1, affects intensity
  color?: string | THREE.Color
  active?: boolean
}

export function SparkTrail({
  position,
  effort,
  color = '#ffaa00',
  active = true,
}: SparkTrailProps) {
  // Only show sparks when effort is high
  const showSparks = effort > 0.6 && active

  return (
    <>
      {showSparks && (
        <ParticleTrail
          position={position}
          color={color}
          maxParticles={50}
          lifetime={0.5}
          emissionRate={effort * 50}
          particleSize={0.3}
          spread={1.5}
          intensity={effort}
          active={true}
        />
      )}
    </>
  )
}
