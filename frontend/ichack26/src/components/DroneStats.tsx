/**
 * Drone Stats Overlay
 *
 * Real-time stats display for a drone during simulation.
 * Shows speed, effort, wind conditions, and progress.
 */

import type { FrameData } from '../types/api'

// ============================================================================
// Types
// ============================================================================

export interface DroneStatsProps {
  /** Current frame data */
  frame: FrameData | null
  /** Route type for styling */
  routeType: 'naive' | 'optimized'
  /** Position on screen */
  position?: 'left' | 'right'
  /** Total waypoints in path */
  totalWaypoints?: number
}

// ============================================================================
// Helper Functions
// ============================================================================

function getWindStatus(frame: FrameData): { label: string; color: string } {
  if (!frame.heading || !frame.wind) return { label: 'No Wind', color: '#888' }

  // Calculate wind alignment with heading
  const headingMag = Math.sqrt(
    frame.heading[0] ** 2 + frame.heading[1] ** 2 + frame.heading[2] ** 2
  )
  const windMag = Math.sqrt(
    frame.wind[0] ** 2 + frame.wind[1] ** 2 + frame.wind[2] ** 2
  )

  if (headingMag < 0.1 || windMag < 0.1) return { label: 'Calm', color: '#6bcb77' }

  // Dot product to determine alignment
  const dot =
    frame.heading[0] * frame.wind[0] +
    frame.heading[1] * frame.wind[1] +
    frame.heading[2] * frame.wind[2]

  const alignment = dot / (headingMag * windMag)

  if (alignment > 0.5) return { label: 'Tailwind', color: '#6bcb77' }
  if (alignment > -0.3) return { label: 'Crosswind', color: '#ffd93d' }
  return { label: 'Headwind', color: '#ff6b6b' }
}

function getEffortLabel(effort: number): { label: string; color: string } {
  if (effort < 0.3) return { label: 'Easy', color: '#6bcb77' }
  if (effort < 0.5) return { label: 'Moderate', color: '#ffd93d' }
  if (effort < 0.7) return { label: 'Working Hard', color: '#ff9f43' }
  return { label: 'Maximum Effort', color: '#ff6b6b' }
}

// ============================================================================
// Component
// ============================================================================

export default function DroneStats({
  frame,
  routeType,
  position = 'left',
  totalWaypoints = 0,
}: DroneStatsProps) {
  if (!frame) return null

  const windStatus = getWindStatus(frame)
  const effortStatus = getEffortLabel(frame.effort)
  const progress = totalWaypoints > 0
    ? Math.round((frame.waypoint_index / totalWaypoints) * 100)
    : 0

  const accentColor = routeType === 'naive' ? '#ff6b6b' : '#4ecdc4'

  return (
    <div style={{
      ...styles.container,
      [position]: 16,
    }}>
      {/* Speed */}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Ground Speed</span>
        <span style={{ ...styles.statValue, color: accentColor }}>
          {frame.groundspeed.toFixed(1)} m/s
        </span>
      </div>

      {/* Airspeed */}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Airspeed</span>
        <span style={styles.statValue}>
          {frame.airspeed.toFixed(1)} m/s
        </span>
      </div>

      {/* Wind Status */}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Wind</span>
        <span style={{ ...styles.statValue, color: windStatus.color }}>
          {windStatus.label}
        </span>
      </div>

      {/* Effort Bar */}
      <div style={styles.effortSection}>
        <div style={styles.effortHeader}>
          <span style={styles.statLabel}>Effort</span>
          <span style={{ ...styles.effortLabel, color: effortStatus.color }}>
            {effortStatus.label}
          </span>
        </div>
        <div style={styles.effortBarBg}>
          <div
            style={{
              ...styles.effortBarFill,
              width: `${frame.effort * 100}%`,
              backgroundColor: effortStatus.color,
            }}
          />
        </div>
      </div>

      {/* Progress */}
      {totalWaypoints > 0 && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Progress</span>
          <span style={styles.statValue}>
            {frame.waypoint_index}/{totalWaypoints} ({progress}%)
          </span>
        </div>
      )}

      {/* Time */}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Time</span>
        <span style={styles.statValue}>
          {frame.time.toFixed(1)}s
        </span>
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
    bottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    minWidth: 160,
    backdropFilter: 'blur(5px)',
    zIndex: 100,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statLabel: {
    color: '#888',
  },
  statValue: {
    color: '#fff',
    fontWeight: 500,
    fontFamily: 'monospace',
  },
  effortSection: {
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 8,
    borderTop: '1px solid #333',
  },
  effortHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  effortLabel: {
    fontSize: 11,
    fontWeight: 600,
  },
  effortBarBg: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  effortBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.1s ease-out',
  },
}
