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

function getWindIndicator(frame: FrameData): { angle: number; speed: number; label: string; color: string } {
  if (!frame.wind) return { angle: 0, speed: 0, label: 'Calm', color: '#888' }

  const windMag = Math.sqrt(
    frame.wind[0] ** 2 + frame.wind[1] ** 2 + frame.wind[2] ** 2
  )

  if (windMag < 0.5) return { angle: 0, speed: windMag, label: 'Calm', color: '#6bcb77' }

  // Calculate wind angle in XY plane (0 = East, 90 = North)
  // Negate to show where wind is coming FROM (opposite of velocity)
  const angle = Math.atan2(-frame.wind[1], -frame.wind[0]) * (180 / Math.PI)

  // Determine color based on alignment with heading
  let color = '#ffd93d' // Default crosswind
  let label = 'Crosswind'

  if (frame.heading) {
    const headingMag = Math.sqrt(
      frame.heading[0] ** 2 + frame.heading[1] ** 2 + frame.heading[2] ** 2
    )
    if (headingMag > 0.1) {
      const dot =
        frame.heading[0] * frame.wind[0] +
        frame.heading[1] * frame.wind[1] +
        frame.heading[2] * frame.wind[2]
      const alignment = dot / (headingMag * windMag)

      if (alignment > 0.5) {
        color = '#6bcb77'
        label = 'Tailwind'
      } else if (alignment < -0.3) {
        color = '#ff6b6b'
        label = 'Headwind'
      }
    }
  }

  return { angle, speed: windMag, label, color }
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
          <div style={styles.windIndicator}>
            <svg width="40" height="40" viewBox="0 0 40 40">
              {/* Background circle */}
              <circle cx="20" cy="20" r="18" fill="none" stroke="#333" strokeWidth="2" />
              {/* Wind arrow - rotates based on wind direction */}
              <g
                style={{
                  transform: `rotate(${wind.angle - 90}deg)`,
                  transformOrigin: '20px 20px',
                  transition: 'transform 0.15s ease-out'
                }}
              >
                <line x1="20" y1="32" x2="20" y2="8" stroke={wind.color} strokeWidth="3" strokeLinecap="round" />
                <polygon points="20,6 14,14 26,14" fill={wind.color} />
              </g>
              {/* Center dot */}
              <circle cx="20" cy="20" r="3" fill={wind.color} />
            </svg>
            <div style={{ fontSize: 10, color: wind.color, marginTop: 2 }}>
              {wind.speed.toFixed(1)} m/s
            </div>
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
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backdropFilter: 'blur(5px)',
    zIndex: 100,
    minWidth: 280,
    fontSize: 12,
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
  windIndicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
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
