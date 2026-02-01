/**
 * Metrics Panel Component
 *
 * Displays comparison metrics between naive and optimized routes
 * after simulation completes. Features animated counters and
 * visual highlighting of improvements.
 */

import { useState, useMemo, useEffect } from 'react';
import { useScene } from '../context/SceneContext';
import MetricCard from './MetricCard';

// ============================================================================
// Icons
// ============================================================================

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
    </svg>
  );
}

function SpeedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z" />
    </svg>
  );
}

// ============================================================================
// Animated Summary Stat Component
// ============================================================================

interface SummaryStatProps {
  value: string;
  label: string;
  delay?: number;
}

function SummaryStat({ value, label, delay = 0 }: SummaryStatProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      style={{
        ...styles.summaryStat,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
      }}
    >
      <span style={styles.summaryValue}>{value}</span>
      <span style={styles.summaryLabel}>{label}</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function MetricsPanel() {
  const { simulation, metrics } = useScene();
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Only show when simulation is complete with both metrics
  const showPanel = simulation.status === 'complete' && metrics.naive && metrics.optimized;

  // Animate panel entrance
  useEffect(() => {
    if (showPanel) {
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [showPanel]);

  const summary = useMemo(() => {
    if (!metrics.naive || !metrics.optimized) return null;

    const naive = metrics.naive;
    const optimized = metrics.optimized;

    // Calculate key improvements
    const timeSaved = naive.total_flight_time - optimized.total_flight_time;
    const energySaved = naive.energy_consumption - optimized.energy_consumption;
    const riskReduction = naive.crash_probability - optimized.crash_probability;

    return {
      naive,
      optimized,
      timeSaved,
      energySaved,
      riskReduction,
      timeImprovement: naive.total_flight_time > 0
        ? (timeSaved / naive.total_flight_time) * 100
        : 0,
      energyImprovement: naive.energy_consumption > 0
        ? (energySaved / naive.energy_consumption) * 100
        : 0,
    };
  }, [metrics]);

  if (!showPanel || !summary) return null;

  // Format duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  };

  return (
    <div
      style={{
        ...styles.container,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      }}
    >
      {/* Header */}
      <div style={styles.header} onClick={() => setIsMinimized(!isMinimized)}>
        <div style={styles.headerContent}>
          <h2 style={styles.title}>Flight Comparison</h2>
          <div style={styles.subtitle}>Wind-Optimized vs Naive Route</div>
        </div>
        <button style={styles.minimizeButton}>
          {isMinimized ? '+' : '−'}
        </button>
      </div>

      {!isMinimized && (
        <>
          {/* Summary Box - Highlighted at top */}
          <div style={styles.summaryBox}>
            <div style={styles.summaryTitle}>Optimization Benefits</div>
            <div style={styles.summaryStats}>
              {summary.timeSaved > 0 && (
                <SummaryStat
                  value={formatDuration(summary.timeSaved)}
                  label="faster"
                  delay={200}
                />
              )}
              {summary.energySaved > 0 && (
                <SummaryStat
                  value={`${summary.energyImprovement.toFixed(0)}%`}
                  label="less energy"
                  delay={400}
                />
              )}
              {summary.riskReduction > 0 && (
                <SummaryStat
                  value={`${summary.riskReduction.toFixed(1)}%`}
                  label="safer"
                  delay={600}
                />
              )}
            </div>
          </div>

          {/* Metrics Grid */}
          <div style={styles.metricsGrid}>
            <MetricCard
              label="Flight Time"
              naiveValue={summary.naive.total_flight_time}
              optimizedValue={summary.optimized.total_flight_time}
              unit="s"
              lowerIsBetter={true}
              decimals={1}
              icon={<ClockIcon />}
              animationDelay={0}
            />

            <MetricCard
              label="Distance"
              naiveValue={summary.naive.total_distance}
              optimizedValue={summary.optimized.total_distance}
              unit="m"
              lowerIsBetter={true}
              decimals={0}
              icon={<RouteIcon />}
              animationDelay={100}
            />

            <MetricCard
              label="Energy Used"
              naiveValue={summary.naive.energy_consumption}
              optimizedValue={summary.optimized.energy_consumption}
              unit="Wh"
              lowerIsBetter={true}
              decimals={2}
              icon={<BatteryIcon />}
              animationDelay={200}
            />

            <MetricCard
              label="Crash Risk"
              naiveValue={summary.naive.crash_probability}
              optimizedValue={summary.optimized.crash_probability}
              unit="%"
              lowerIsBetter={true}
              decimals={2}
              icon={<ShieldIcon />}
              animationDelay={300}
            />

            <MetricCard
              label="Avg Speed"
              naiveValue={summary.naive.average_ground_speed}
              optimizedValue={summary.optimized.average_ground_speed}
              unit="m/s"
              lowerIsBetter={false}
              decimals={1}
              icon={<SpeedIcon />}
              animationDelay={400}
            />

            <MetricCard
              label="Turbulence Zones"
              naiveValue={summary.naive.turbulence_zones_crossed}
              optimizedValue={summary.optimized.turbulence_zones_crossed}
              unit=""
              lowerIsBetter={true}
              decimals={0}
              icon={<WindIcon />}
              animationDelay={500}
            />
          </div>

          {/* Additional Details (expandable) */}
          <div style={styles.detailsSection}>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Max Turbulence</span>
              <span style={styles.detailValues}>
                <span style={{ color: '#ff6b6b' }}>
                  {summary.naive.max_turbulence_encountered.toFixed(2)}
                </span>
                <span style={styles.detailSeparator}>vs</span>
                <span style={{ color: '#4ecdc4' }}>
                  {summary.optimized.max_turbulence_encountered.toFixed(2)}
                </span>
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Max Wind Speed</span>
              <span style={styles.detailValues}>
                <span style={{ color: '#ff6b6b' }}>
                  {summary.naive.max_wind_speed_encountered.toFixed(1)} m/s
                </span>
                <span style={styles.detailSeparator}>vs</span>
                <span style={{ color: '#4ecdc4' }}>
                  {summary.optimized.max_wind_speed_encountered.toFixed(1)} m/s
                </span>
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Headwind Segments</span>
              <span style={styles.detailValues}>
                <span style={{ color: '#ff6b6b' }}>
                  {summary.naive.headwind_segments}
                </span>
                <span style={styles.detailSeparator}>vs</span>
                <span style={{ color: '#4ecdc4' }}>
                  {summary.optimized.headwind_segments}
                </span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    left: 30,
    margin: 15,
    maxHeight: '95%',
    width: '95%',
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    zIndex: 1000,
    backdropFilter: 'blur(5px)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid #333',
    cursor: 'pointer',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 10,
    color: '#888',
  },
  minimizeButton: {
    width: 20,
    height: 20,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBox: {
    margin: '12px',
    padding: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderRadius: 8,
    borderTop: '1px solid #333',
  },
  summaryTitle: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
    textAlign: 'center',
    marginBottom: 8,
  },
  summaryStats: {
    display: 'flex',
    justifyContent: 'space-around',
  },
  summaryStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 700,
    color: '#6bcb77',
    fontFamily: 'monospace',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: '0 12px 12px 12px',
  },
  detailsSection: {
    borderTop: '1px solid #333',
    padding: '12px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
  },
  detailValues: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  detailSeparator: {
    color: '#666',
    fontSize: 9,
  },
};
