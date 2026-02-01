/**
 * ASCII Background Component
 * 
 * Converts an image to ASCII art with rotation effect.
 */

import { useEffect, useRef, useState } from 'react'

// ============================================================================
// ASCII Conversion
// ============================================================================

// ASCII characters from darkest to lightest
const ASCII_CHARS = ' .:-=+*#%@'

function brightnessToAscii(brightness: number): string {
  const index = Math.floor(brightness * (ASCII_CHARS.length - 1))
  return ASCII_CHARS[Math.max(0, Math.min(ASCII_CHARS.length - 1, index))]
}

function imageToAscii(
  imageData: ImageData,
  width: number,
  height: number
): string {
  let ascii = ''

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = imageData.data[i]
      const g = imageData.data[i + 1]
      const b = imageData.data[i + 2]

      // Calculate perceived brightness
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255

      ascii += brightnessToAscii(brightness)
    }
    ascii += '\n'
  }

  return ascii
}

// ============================================================================
// Main Component
// ============================================================================

interface AsciiBackgroundProps {
  imageUrl: string
  width?: number
  height?: number
  rotationSpeed?: number
  centerX?: string | number  // Position of center point (e.g., "50%" or 400)
  centerY?: string | number  // Position of center point
  offsetX?: number           // Additional offset in pixels
  offsetY?: number           // Additional offset in pixels
}

export default function AsciiBackground({
  imageUrl,
  width = 80,
  height = 40,
  rotationSpeed = 0.5, // degrees per frame
  centerX = '50%',
  centerY = '50%',
  offsetX = 0,
  offsetY = 0,
}: AsciiBackgroundProps) {
  const [ascii, setAscii] = useState<string>('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const rotationRef = useRef<number>(0)
  const animationRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // Load image
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      console.log('[AsciiBackground] Image loaded:', img.width, 'x', img.height)
      imageRef.current = img

      // Start animation loop
      const animate = () => {
        if (!imageRef.current || !canvas || !ctx) return

        // Clear canvas
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)

        // Save context state
        ctx.save()

        // Translate to center, rotate, translate back
        ctx.translate(width / 2, height / 2)
        ctx.rotate((rotationRef.current * Math.PI) / 180)
        ctx.translate(-width / 2, -height / 2)

        // Draw image scaled to canvas
        const scale = Math.min(width / img.width, height / img.height) * 0.8
        const drawWidth = img.width * scale
        const drawHeight = img.height * scale
        const x = (width - drawWidth) / 2
        const y = (height - drawHeight) / 2

        ctx.drawImage(img, x, y, drawWidth, drawHeight)

        // Restore context
        ctx.restore()

        // Get image data and convert to ASCII
        const imageData = ctx.getImageData(0, 0, width, height)
        const asciiArt = imageToAscii(imageData, width, height)
        setAscii(asciiArt)

        // Update rotation
        rotationRef.current = (rotationRef.current + rotationSpeed) % 360

        // Continue animation
        animationRef.current = requestAnimationFrame(animate)
      }

      animate()
    }

    img.onerror = (e) => {
      console.error('[AsciiBackground] Failed to load image:', e)
    }

    img.src = imageUrl

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [imageUrl, width, height, rotationSpeed])

  return (
    <>
      {/* ASCII Text Display */}
      <pre
        style={{
          position: 'absolute',
          top: `calc(${typeof centerY === 'string' ? centerY : `${centerY}px`} + ${offsetY}px)`,
          left: `calc(${typeof centerX === 'string' ? centerX : `${centerX}px`} + ${offsetX}px)`,
          transform: 'translate(-50%, -50%)',
          margin: 0,
          padding: 0,
          fontFamily: 'monospace',
          fontSize: '10px',
          lineHeight: '10px',
          color: 'rgba(78, 205, 196, 0.3)',
          overflow: 'visible',
          whiteSpace: 'pre',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {ascii}
      </pre>

      {/* Hidden canvas for image processing */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'none' }}
      />
    </>
  )
}
