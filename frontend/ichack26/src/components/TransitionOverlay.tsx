/**
 * Transition Overlay Component
 *
 * Full-screen overlay shown between demo phases.
 */

// ============================================================================
// Types
// ============================================================================

export interface TransitionOverlayProps {
  /** Main message to display */
  message: string
  /** Optional subtitle */
  subtitle?: string
  /** Accent color */
  accentColor?: string
  /** Whether to show loading spinner */
  showSpinner?: boolean
}

// ============================================================================
// Component
// ============================================================================

export default function TransitionOverlay({
  message,
  subtitle,
  accentColor = '#4ecdc4',
  showSpinner = true,
}: TransitionOverlayProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.content}>
        {/* Animated spinner */}
        {showSpinner && (
          <div style={styles.spinnerContainer}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="#333"
                strokeWidth="4"
              />
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke={accentColor}
                strokeWidth="4"
                strokeDasharray="80 80"
                strokeLinecap="round"
                style={{
                  animation: 'spin 1s linear infinite',
                  transformOrigin: 'center',
                }}
              />
            </svg>
          </div>
        )}

        {/* Message */}
        <h1 style={{ ...styles.message, color: accentColor }}>{message}</h1>

        {/* Subtitle */}
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>

      {/* CSS animation */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    zIndex: 2000,
    backdropFilter: 'blur(10px)',
  },
  content: {
    textAlign: 'center',
    padding: 40,
  },
  spinnerContainer: {
    marginBottom: 24,
  },
  message: {
    margin: 0,
    fontSize: 28,
    fontWeight: 600,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    margin: '16px 0 0 0',
    fontSize: 16,
    color: '#888',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
}
