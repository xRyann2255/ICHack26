/**
 * Metrics Overlay Component
 *
 * Real-time metrics display overlaid on the drone flight view.
 */

import type { FrameData } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface MetricsOverlayProps {
  /** Current frame data */
  frame: FrameData | null
  /** Route type for styling */
  routeType: 'naive' | 'optimized'
  /** Total waypoints */
  totalWaypoints?: number
}

// ============================================================================
// Helper Functions
// ============================================================================

function getWindIndicator(frame: FrameData): { icon: string; label: string; color: string } {
  if (!frame.heading || !frame.wind) return { icon: '○', label: 'Calm', color: '#888' }

  const headingMag = Math.sqrt(
    frame.heading[0] ** 2 + frame.heading[1] ** 2 + frame.heading[2] ** 2
  )
  const windMag = Math.sqrt(
    frame.wind[0] ** 2 + frame.wind[1] ** 2 + frame.wind[2] ** 2
  )

  if (windMag < 0.5) return { icon: '○', label: 'Calm', color: '#6bcb77' }

  const dot =
    frame.heading[0] * frame.wind[0] +
    frame.heading[1] * frame.wind[1] +
    frame.heading[2] * frame.wind[2]

  const alignment = headingMag > 0.1 ? dot / (headingMag * windMag) : 0

  if (alignment > 0.5) return { icon: '↓', label: 'Tailwind', color: '#6bcb77' }
  if (alignment > -0.3) return { icon: '→', label: 'Crosswind', color: '#ffd93d' }
  return { icon: '↑', label: 'Headwind', color: '#ff6b6b' }
}

function getEffortColor(effort: number): string {
  if (effort < 0.3) return '#6bcb77'
  if (effort < 0.5) return '#ffd93d'
  if (effort < 0.7) return '#ff9f43'
  return '#ff6b6b'
}

// ============================================================================
// Component
// ============================================================================

export default function MetricsOverlay({
  frame,
  routeType,
  totalWaypoints = 0,
}: MetricsOverlayProps) {
  if (!frame) return null

  const wind = getWindIndicator(frame)
  const effortColor = getEffortColor(frame.effort)
  const accentColor = routeType === 'naive' ? '#ff6b6b' : '#4ecdc4'
  const progress = totalWaypoints > 0
    ? Math.round((frame.waypoint_index / totalWaypoints) * 100)
    : 0

  return (
    <div style={styles.container}>
      {/* Main stats row */}
      <div style={styles.mainStats}>
        {/* Speed */}
        <div style={styles.statBlock}>
          <div style={styles.statValue}>
            <span style={{ color: accentColor, fontSize: 28, fontWeight: 700 }}>
              {frame.groundspeed.toFixed(1)}
            </span>
            <span style={styles.unit}>m/s</span>
          </div>
          <div style={styles.statLabel}>Ground Speed</div>
        </div>

        {/* Effort gauge */}
        <div style={styles.statBlock}>
          <div style={styles.effortGauge}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              {/* Background arc */}
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="#333"
                strokeWidth="6"
                strokeDasharray="118 40"
                strokeLinecap="round"
                transform="rotate(135 30 30)"
              />
              {/* Effort arc */}
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke={effortColor}
                strokeWidth="6"
                strokeDasharray={`${frame.effort * 118} 158`}
                strokeLinecap="round"
                transform="rotate(135 30 30)"
              />
              {/* Effort text */}
              <text
                x="30"
                y="35"
                textAnchor="middle"
                fill={effortColor}
                fontSize="14"
                fontWeight="700"
              >
                {Math.round(frame.effort * 100)}%
              </text>
            </svg>
          </div>
          <div style={styles.statLabel}>Effort</div>
        </div>

        {/* Wind indicator */}
        <div style={styles.statBlock}>
          <div style={{ ...styles.windIcon, color: wind.color }}>
            {wind.icon}
          </div>
          <div style={{ ...styles.statLabel, color: wind.color }}>
            {wind.label}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progress}%`,
              backgroundColor: accentColor,
            }}
          />
        </div>
        <div style={styles.progressText}>
          {progress}% Complete • {frame.time.toFixed(1)}s
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
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 20px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backdropFilter: 'blur(10px)',
    zIndex: 100,
    minWidth: 280,
  },
  mainStats: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 20,
  },
  statBlock: {
    textAlign: 'center',
  },
  statValue: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  unit: {
    fontSize: 12,
    color: '#888',
  },
  statLabel: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: 4,
  },
  effortGauge: {
    display: 'flex',
    justifyContent: 'center',
  },
  windIcon: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
  },
  progressSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #333',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.2s ease-out',
  },
  progressText: {
    marginTop: 6,
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
  },
}
