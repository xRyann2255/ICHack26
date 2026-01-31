/**
 * Metrics Panel Component
 *
 * Displays comparison metrics between naive and optimized routes
 * after simulation completes.
 */

import { useMemo } from 'react';
import { useScene } from '../context/SceneContext';
import type { RouteMetrics } from '../types/api';

// ============================================================================
// Types
// ============================================================================

interface MetricComparisonProps {
  label: string;
  naiveValue: number;
  optimizedValue: number;
  unit: string;
  /** If true, lower is better (time, energy). If false, higher is better. */
  lowerIsBetter?: boolean;
  /** Number of decimal places */
  decimals?: number;
}

// ============================================================================
// Helper Components
// ============================================================================

function MetricComparison({
  label,
  naiveValue,
  optimizedValue,
  unit,
  lowerIsBetter = true,
  decimals = 1,
}: MetricComparisonProps) {
  const diff = naiveValue - optimizedValue;
  const percentDiff = naiveValue > 0 ? (diff / naiveValue) * 100 : 0;

  const isBetter = lowerIsBetter ? optimizedValue < naiveValue : optimizedValue > naiveValue;
  const improvementText = lowerIsBetter
    ? diff > 0 ? `${diff.toFixed(decimals)} ${unit} less` : `${(-diff).toFixed(decimals)} ${unit} more`
    : diff < 0 ? `${(-diff).toFixed(decimals)} ${unit} more` : `${diff.toFixed(decimals)} ${unit} less`;

  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValues}>
        <div style={styles.metricColumn}>
          <span style={styles.routeLabel}>Naive</span>
          <span style={{ ...styles.metricValue, color: '#ff6b6b' }}>
            {naiveValue.toFixed(decimals)} {unit}
          </span>
        </div>
        <div style={styles.metricColumn}>
          <span style={styles.routeLabel}>Optimized</span>
          <span style={{ ...styles.metricValue, color: '#4ecdc4' }}>
            {optimizedValue.toFixed(decimals)} {unit}
          </span>
        </div>
      </div>
      {Math.abs(percentDiff) > 0.1 && (
        <div style={{
          ...styles.improvement,
          color: isBetter ? '#6bcb77' : '#ff6b6b',
        }}>
          {isBetter ? '+' : ''}{percentDiff.toFixed(1)}% {improvementText}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(0)}s`;
}

// ============================================================================
// Main Component
// ============================================================================

export default function MetricsPanel() {
  const { simulation, metrics } = useScene();

  // Only show when simulation is complete with both metrics
  const showPanel = simulation.status === 'complete' && metrics.naive && metrics.optimized;

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Flight Comparison</h2>
        <div style={styles.subtitle}>Wind-Optimized vs Naive Route</div>
      </div>

      {/* Key Metrics */}
      <div style={styles.metricsGrid}>
        <MetricComparison
          label="Flight Time"
          naiveValue={summary.naive.total_flight_time}
          optimizedValue={summary.optimized.total_flight_time}
          unit="s"
          lowerIsBetter={true}
        />

        <MetricComparison
          label="Distance"
          naiveValue={summary.naive.total_distance}
          optimizedValue={summary.optimized.total_distance}
          unit="m"
          lowerIsBetter={true}
          decimals={0}
        />

        <MetricComparison
          label="Energy Used"
          naiveValue={summary.naive.energy_consumption}
          optimizedValue={summary.optimized.energy_consumption}
          unit="Wh"
          lowerIsBetter={true}
          decimals={2}
        />

        <MetricComparison
          label="Crash Risk"
          naiveValue={summary.naive.crash_probability}
          optimizedValue={summary.optimized.crash_probability}
          unit="%"
          lowerIsBetter={true}
          decimals={2}
        />

        <MetricComparison
          label="Avg Speed"
          naiveValue={summary.naive.average_ground_speed}
          optimizedValue={summary.optimized.average_ground_speed}
          unit="m/s"
          lowerIsBetter={false}
        />

        <MetricComparison
          label="Turbulence Zones"
          naiveValue={summary.naive.turbulence_zones_crossed}
          optimizedValue={summary.optimized.turbulence_zones_crossed}
          unit=""
          lowerIsBetter={true}
          decimals={0}
        />
      </div>

      {/* Summary Box */}
      <div style={styles.summaryBox}>
        <div style={styles.summaryTitle}>Optimization Benefits</div>
        <div style={styles.summaryStats}>
          {summary.timeSaved > 0 && (
            <div style={styles.summaryStat}>
              <span style={styles.summaryValue}>{formatDuration(summary.timeSaved)}</span>
              <span style={styles.summaryLabel}>faster</span>
            </div>
          )}
          {summary.energySaved > 0 && (
            <div style={styles.summaryStat}>
              <span style={styles.summaryValue}>{summary.energyImprovement.toFixed(0)}%</span>
              <span style={styles.summaryLabel}>less energy</span>
            </div>
          )}
          {summary.riskReduction > 0 && (
            <div style={styles.summaryStat}>
              <span style={styles.summaryValue}>{summary.riskReduction.toFixed(1)}%</span>
              <span style={styles.summaryLabel}>safer</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    minWidth: 320,
    maxWidth: 400,
    zIndex: 1000,
    backdropFilter: 'blur(10px)',
  },
  header: {
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#888',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  metricCard: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  metricValues: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  routeLabel: {
    fontSize: 9,
    color: '#666',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  improvement: {
    marginTop: 6,
    fontSize: 10,
    textAlign: 'center',
  },
  summaryBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.15)',
    borderRadius: 8,
    border: '1px solid rgba(78, 205, 196, 0.3)',
  },
  summaryTitle: {
    fontSize: 11,
    color: '#4ecdc4',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
    textAlign: 'center',
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
  },
  summaryLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
};
