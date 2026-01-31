/**
 * Post-processing Effects Component
 *
 * Adds visual effects like bloom, vignette, and color adjustments
 * for enhanced visual impact during the demo.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  ToneMapping,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

export interface EffectsProps {
  /** Enable bloom effect */
  bloom?: boolean
  /** Bloom intensity (0-2) */
  bloomIntensity?: number
  /** Bloom threshold - only pixels brighter than this glow */
  bloomThreshold?: number
  /** Bloom smoothing */
  bloomSmoothing?: number
  /** Enable vignette (darkened edges) */
  vignette?: boolean
  /** Vignette darkness (0-1) */
  vignetteDarkness?: number
  /** Enable chromatic aberration (color fringing) */
  chromaticAberration?: boolean
  /** Chromatic aberration offset */
  chromaticOffset?: number
  /** Enable tone mapping */
  toneMapping?: boolean
}

// ============================================================================
// Main Component
// ============================================================================

export default function Effects({
  bloom = true,
  bloomIntensity = 0.8,
  bloomThreshold = 0.6,
  bloomSmoothing = 0.4,
  vignette = true,
  vignetteDarkness = 0.4,
  chromaticAberration = false,
  chromaticOffset = 0.002,
  toneMapping = true,
}: EffectsProps) {
  // Chromatic aberration offset vector
  const offsetRef = useRef(new THREE.Vector2(chromaticOffset, chromaticOffset))

  // Optional: animate chromatic aberration for dynamic effect
  useFrame((state) => {
    if (chromaticAberration && offsetRef.current) {
      const time = state.clock.elapsedTime
      const wobble = Math.sin(time * 2) * 0.0005
      offsetRef.current.set(chromaticOffset + wobble, chromaticOffset + wobble)
    }
  })

  return (
    <EffectComposer>
      {/* Bloom - makes bright areas glow */}
      {bloom && (
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={bloomSmoothing}
          mipmapBlur
        />
      )}

      {/* Vignette - darkens edges for cinematic look */}
      {vignette && (
        <Vignette
          darkness={vignetteDarkness}
          offset={0.3}
          blendFunction={BlendFunction.NORMAL}
        />
      )}

      {/* Chromatic Aberration - color fringing effect */}
      {chromaticAberration && (
        <ChromaticAberration
          offset={offsetRef.current}
          blendFunction={BlendFunction.NORMAL}
          radialModulation={false}
          modulationOffset={0}
        />
      )}

      {/* Tone Mapping - better color representation */}
      {toneMapping && (
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      )}
    </EffectComposer>
  )
}

// ============================================================================
// Preset Configurations
// ============================================================================

/** Subtle effects for general use */
export const PRESET_SUBTLE: EffectsProps = {
  bloom: true,
  bloomIntensity: 0.5,
  bloomThreshold: 0.7,
  vignette: true,
  vignetteDarkness: 0.3,
  chromaticAberration: false,
  toneMapping: true,
}

/** Cinematic effects for dramatic presentation */
export const PRESET_CINEMATIC: EffectsProps = {
  bloom: true,
  bloomIntensity: 1.0,
  bloomThreshold: 0.5,
  bloomSmoothing: 0.5,
  vignette: true,
  vignetteDarkness: 0.5,
  chromaticAberration: true,
  chromaticOffset: 0.003,
  toneMapping: true,
}

/** High performance - minimal effects */
export const PRESET_PERFORMANCE: EffectsProps = {
  bloom: true,
  bloomIntensity: 0.3,
  bloomThreshold: 0.8,
  vignette: false,
  chromaticAberration: false,
  toneMapping: false,
}
