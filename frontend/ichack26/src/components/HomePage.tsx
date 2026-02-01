/**
 * Home Page Component
 *
 * Landing page with logo and "Plan a Route" button.
 * Shows loading screen while scene loads in background.
 */

import { useState, useEffect } from 'react'
import AsciiBackground from './AsciiBackground'

// ============================================================================
// Add keyframes animation to document
// ============================================================================

const addScanAnimation = () => {
  const styleId = 'scan-animation-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes scan {
        0% {
          left: -100%;
        }
        50% {
          left: 100%;
        }
        100% {
          left: 100%;
        }
      }
    `
    document.head.appendChild(style)
  }
}

// ============================================================================
// Types
// ============================================================================

interface HomePageProps {
  /** Callback when user clicks "Plan a Route" */
  onPlanRoute: () => void
  /** Optional image URL for ASCII background */
  imageUrl?: string
}

// ============================================================================
// Component
// ============================================================================

export default function HomePage({ onPlanRoute, imageUrl }: HomePageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isButtonHovered, setIsButtonHovered] = useState(false)

  useEffect(() => {
    addScanAnimation()
  }, [])

  const handlePlanRoute = () => {
    setIsLoading(true)
    onPlanRoute()
  }

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingContent}>
          <div style={styles.spinner} />
          <div style={styles.loadingText}>Loading Scene...</div>
          <div style={styles.loadingHint}>
            Preparing 3D environment and wind field data
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* ASCII Background - center of image positioned at logo top-left corner */}
      {imageUrl && (
        <AsciiBackground
          imageUrl={imageUrl}
          width={100}
          height={40}
          centerX="calc(50% - 48px)"  // 50% minus half of logo width approximation
          centerY="calc(50% - 72px)"  // 50% minus vertical offset to logo top
          offsetX={-90}
          offsetY={-90}
        />
      )}

      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          <div style={styles.logo}>
            {/* Corner brackets */}
            <div style={styles.cornerTopLeft} />
            <div style={styles.cornerTopRight} />
            <div style={styles.cornerBottomLeft} />
            <div style={styles.cornerBottomRight} />
            {/* Scanning effect */}
            <div style={styles.scanEffect} />
            <span style={styles.logoText}>
              {'TRACR'.split('').map((letter, index) => (
                <span key={index} className="logo-letter" style={styles.logoLetter}>
                  {letter}
                </span>
              ))}
            </span>
          </div>
          <div style={styles.tagline}>
            Tactical Route Analysis & Control
          </div>
        </div>

        {/* Plan Route Button */}
        <button
          style={styles.button}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)'
            setIsButtonHovered(true)
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            setIsButtonHovered(false)
          }}
          onClick={handlePlanRoute}
        >
          <div style={{
            ...styles.buttonCornerTopLeft,
            ...(isButtonHovered ? { transform: 'translate(-4px, -4px)' } : {}),
          }} />
          <div style={{
            ...styles.buttonCornerTopRight,
            ...(isButtonHovered ? { transform: 'translate(4px, -4px)' } : {}),
          }} />
          <div style={{
            ...styles.buttonCornerBottomLeft,
            ...(isButtonHovered ? { transform: 'translate(-4px, 4px)' } : {}),
          }} />
          <div style={{
            ...styles.buttonCornerBottomRight,
            ...(isButtonHovered ? { transform: 'translate(4px, 4px)' } : {}),
          }} />
          Plan a Route
        </button>

        {/* Footer */}
        <div style={styles.footer}>
          Autonomous drone route optimization with wind analysis
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 48,
    animation: 'fadeIn 0.8s ease-in',
    position: 'relative',
    zIndex: 10,
  },
  logoContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    padding: '24px 48px',
    position: 'relative',
    overflow: 'hidden',
  },
  scanEffect: {
    position: 'absolute',
    top: 0,
    left: '-100%',
    width: '15%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(78, 205, 196, 0.4), rgba(78, 205, 196, 0.4), transparent)',
    animation: 'scan 2s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 1,
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderTop: '2px solid #4ecdc4',
    borderLeft: '2px solid #4ecdc4',
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderTop: '2px solid #4ecdc4',
    borderRight: '2px solid #4ecdc4',
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 20,
    height: 20,
    borderBottom: '2px solid #4ecdc4',
    borderLeft: '2px solid #4ecdc4',
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderBottom: '2px solid #4ecdc4',
    borderRight: '2px solid #4ecdc4',
  },
  logoText: {
    fontSize: 72,
    fontWeight: 800,
    color: '#4ecdc4',
    letterSpacing: '0.15em',
    position: 'relative',
    zIndex: 2,
    display: 'inline-block',
  },
  logoLetter: {
    display: 'inline-block',
  },
  tagline: {
    fontSize: 18,
    color: '#aaa',
    textAlign: 'center',
    letterSpacing: '0.05em',
  },
  button: {
    padding: '18px 48px',
    fontSize: 18,
    fontWeight: 600,
    color: '#4ecdc4',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative',
  },
  buttonCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderTop: '2px solid #4ecdc4',
    borderLeft: '2px solid #4ecdc4',
    transition: 'all 0.3s ease',
  },
  buttonCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderTop: '2px solid #4ecdc4',
    borderRight: '2px solid #4ecdc4',
    transition: 'all 0.3s ease',
  },
  buttonCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 16,
    height: 16,
    borderBottom: '2px solid #4ecdc4',
    borderLeft: '2px solid #4ecdc4',
    transition: 'all 0.3s ease',
  },
  buttonCornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderBottom: '2px solid #4ecdc4',
    borderRight: '2px solid #4ecdc4',
    transition: 'all 0.3s ease',
  },
  footer: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  spinner: {
    width: 60,
    height: 60,
    border: '4px solid rgba(78, 205, 196, 0.2)',
    borderTop: '4px solid #4ecdc4',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: 24,
    fontWeight: 600,
    color: '#4ecdc4',
  },
  loadingHint: {
    fontSize: 14,
    color: '#888',
  },
}
