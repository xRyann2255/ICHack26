/**
 * Environment Component
 *
 * Sets up the scene environment including skybox, fog,
 * lighting presets, and atmospheric effects.
 */

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky, Stars, Cloud } from '@react-three/drei'
import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

export type EnvironmentPreset = 'day' | 'sunset' | 'night' | 'dawn' | 'overcast'

export interface EnvironmentProps {
  /** Environment preset */
  preset?: EnvironmentPreset
  /** Show sky dome */
  showSky?: boolean
  /** Show stars (visible at night) */
  showStars?: boolean
  /** Show clouds */
  showClouds?: boolean
  /** Fog density (0 = no fog, 1 = dense) */
  fogDensity?: number
  /** Custom fog color (overrides preset) */
  fogColor?: string
  /** Custom background color (overrides preset) */
  backgroundColor?: string
  /** Animate sun position */
  animateSun?: boolean
  /** Sun animation speed */
  sunSpeed?: number
}

// ============================================================================
// Preset Configurations
// ============================================================================

interface PresetConfig {
  backgroundColor: string
  fogColor: string
  fogNear: number
  fogFar: number
  sunPosition: [number, number, number]
  ambientIntensity: number
  sunIntensity: number
  starOpacity: number
  skyTurbidity: number
  skyRayleigh: number
  skyMieCoefficient: number
  skyMieDirectionalG: number
}

const PRESETS: Record<EnvironmentPreset, PresetConfig> = {
  day: {
    backgroundColor: '#87CEEB',
    fogColor: '#c9e6ff',
    fogNear: 500,
    fogFar: 2000,
    sunPosition: [100, 200, 100],
    ambientIntensity: 0.5,
    sunIntensity: 1.2,
    starOpacity: 0,
    skyTurbidity: 8,
    skyRayleigh: 2,
    skyMieCoefficient: 0.005,
    skyMieDirectionalG: 0.8,
  },
  sunset: {
    backgroundColor: '#ff7f50',
    fogColor: '#ffb88c',
    fogNear: 300,
    fogFar: 1500,
    sunPosition: [200, 20, 50],
    ambientIntensity: 0.3,
    sunIntensity: 0.8,
    starOpacity: 0.2,
    skyTurbidity: 10,
    skyRayleigh: 3,
    skyMieCoefficient: 0.1,
    skyMieDirectionalG: 0.95,
  },
  night: {
    backgroundColor: '#0a0a1a',
    fogColor: '#1a1a2e',
    fogNear: 200,
    fogFar: 1000,
    sunPosition: [-100, -50, 0],
    ambientIntensity: 0.15,
    sunIntensity: 0.1,
    starOpacity: 1,
    skyTurbidity: 20,
    skyRayleigh: 0.5,
    skyMieCoefficient: 0.001,
    skyMieDirectionalG: 0.5,
  },
  dawn: {
    backgroundColor: '#ffd4a3',
    fogColor: '#ffe4c9',
    fogNear: 400,
    fogFar: 1800,
    sunPosition: [50, 10, 200],
    ambientIntensity: 0.35,
    sunIntensity: 0.6,
    starOpacity: 0.3,
    skyTurbidity: 7,
    skyRayleigh: 4,
    skyMieCoefficient: 0.05,
    skyMieDirectionalG: 0.9,
  },
  overcast: {
    backgroundColor: '#708090',
    fogColor: '#a0a0a0',
    fogNear: 200,
    fogFar: 800,
    sunPosition: [100, 150, 100],
    ambientIntensity: 0.6,
    sunIntensity: 0.4,
    starOpacity: 0,
    skyTurbidity: 15,
    skyRayleigh: 1,
    skyMieCoefficient: 0.01,
    skyMieDirectionalG: 0.7,
  },
}

// ============================================================================
// Main Component
// ============================================================================

export default function Environment({
  preset = 'night',
  showSky = true,
  showStars = true,
  showClouds = false,
  fogDensity = 0.5,
  fogColor: customFogColor,
  backgroundColor: customBgColor,
  animateSun = false,
  sunSpeed = 0.1,
}: EnvironmentProps) {
  const { scene } = useThree()
  const sunPositionRef = useRef<THREE.Vector3>(new THREE.Vector3())

  const config = PRESETS[preset]

  // Set up scene background and fog
  useMemo(() => {
    // Background
    const bgColor = customBgColor || config.backgroundColor
    scene.background = new THREE.Color(bgColor)

    // Fog
    if (fogDensity > 0) {
      const fColor = customFogColor || config.fogColor
      const near = config.fogNear / fogDensity
      const far = config.fogFar / fogDensity
      scene.fog = new THREE.Fog(fColor, near, far)
    } else {
      scene.fog = null
    }
  }, [scene, config, fogDensity, customFogColor, customBgColor])

  // Animate sun position
  const currentSunPosition = useMemo(() => {
    return new THREE.Vector3(...config.sunPosition)
  }, [config.sunPosition])

  useFrame((state) => {
    if (animateSun) {
      const time = state.clock.elapsedTime * sunSpeed
      sunPositionRef.current.set(
        Math.cos(time) * 200,
        Math.sin(time) * 100 + 100,
        Math.sin(time * 0.5) * 200
      )
    } else {
      sunPositionRef.current.copy(currentSunPosition)
    }
  })

  return (
    <>
      {/* Ambient light */}
      <ambientLight intensity={config.ambientIntensity} />

      {/* Directional (sun) light */}
      <directionalLight
        position={config.sunPosition}
        intensity={config.sunIntensity}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={500}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />

      {/* Sky dome */}
      {showSky && (
        <Sky
          distance={450000}
          sunPosition={currentSunPosition.toArray() as [number, number, number]}
          inclination={0.5}
          azimuth={0.25}
          turbidity={config.skyTurbidity}
          rayleigh={config.skyRayleigh}
          mieCoefficient={config.skyMieCoefficient}
          mieDirectionalG={config.skyMieDirectionalG}
        />
      )}

      {/* Stars (visible based on preset) */}
      {showStars && config.starOpacity > 0 && (
        <Stars
          radius={300}
          depth={100}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={0.5}
        />
      )}

      {/* Clouds (optional) */}
      {showClouds && (
        <group position={[0, 150, 0]}>
          <Cloud
            opacity={0.5}
            speed={0.2}
            segments={20}
          />
          <Cloud
            position={[-100, 20, 50]}
            opacity={0.4}
            speed={0.15}
            segments={15}
          />
          <Cloud
            position={[100, -10, -50]}
            opacity={0.4}
            speed={0.25}
            segments={18}
          />
        </group>
      )}

      {/* Hemisphere light for more natural lighting */}
      <hemisphereLight
        color="#ffffff"
        groundColor="#444444"
        intensity={0.3}
      />
    </>
  )
}

// ============================================================================
// Simple Gradient Background (for minimal scenes)
// ============================================================================

export interface GradientBackgroundProps {
  topColor?: string
  bottomColor?: string
}

export function GradientBackground({
  topColor = '#1a1a2e',
  bottomColor = '#16213e',
}: GradientBackgroundProps) {
  const { scene } = useThree()

  useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, topColor)
    gradient.addColorStop(1, bottomColor)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 2, 256)

    const texture = new THREE.CanvasTexture(canvas)
    texture.mapping = THREE.EquirectangularReflectionMapping
    scene.background = texture
  }, [scene, topColor, bottomColor])

  return null
}
