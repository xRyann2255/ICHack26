/**
 * Home Page Component
 *
 * Landing page with logo and "Plan a Route" button.
 * Shows loading screen while scene loads in background.
 */

import { useState } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface HomePageProps {
  /** Callback when user clicks "Plan a Route" */
  onPlanRoute: () => void
}

// ============================================================================
// Component
// ============================================================================

export default function HomePage({ onPlanRoute }: HomePageProps) {
  const [isLoading, setIsLoading] = useState(false)

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
      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          <div style={styles.logo}>
            <span style={styles.logoText}>TRACR</span>
          </div>
          <div style={styles.tagline}>
            Drone Route Planning with Wind Optimization
          </div>
        </div>

        {/* Plan Route Button */}
        <button
          style={styles.button}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(78, 205, 196, 0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(78, 205, 196, 0.3)'
          }}
          onClick={handlePlanRoute}
        >
          Plan a Route
        </button>

        {/* Footer */}
        <div style={styles.footer}>
          Click to start planning your optimized drone route
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
  },
  logoContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    padding: '24px 48px',
    background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.2) 0%, rgba(78, 205, 196, 0.05) 100%)',
    border: '2px solid rgba(78, 205, 196, 0.5)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(78, 205, 196, 0.2)',
  },
  logoText: {
    fontSize: 72,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #4ecdc4 0%, #6bcb77 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '0.1em',
  },
  tagline: {
    fontSize: 20,
    color: '#888',
    textAlign: 'center',
    maxWidth: 500,
  },
  button: {
    padding: '20px 48px',
    fontSize: 24,
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #4ecdc4 0%, #44a6a0 100%)',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(78, 205, 196, 0.3)',
  },
  footer: {
    fontSize: 14,
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
