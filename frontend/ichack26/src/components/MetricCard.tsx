/**
 * Metric Card Component
 *
 * A single metric card with comparison between naive and optimized routes.
 * Features animated counter effect on value changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface MetricCardProps {
  /** Metric label */
  label: string;
  /** Value for naive route */
  naiveValue: number;
  /** Value for optimized route */
  optimizedValue: number;
  /** Unit suffix (e.g., "s", "m", "Wh", "%") */
  unit: string;
  /** If true, lower is better. If false, higher is better */
  lowerIsBetter?: boolean;
  /** Number of decimal places */
  decimals?: number;
  /** Icon to display (optional) */
  icon?: React.ReactNode;
  /** Animation duration in ms */
  animationDuration?: number;
  /** Delay before animation starts */
  animationDelay?: number;
}

// ============================================================================
// Animated Counter Hook
// ============================================================================

function useAnimatedCounter(
  targetValue: number,
  duration: number = 1000,
  delay: number = 0,
  decimals: number = 1
): number {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(0);

  useEffect(() => {
    let animationFrame: number;
    let timeoutId: ReturnType<typeof setTimeout>;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValueRef.current + (targetValue - startValueRef.current) * easeOut;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    timeoutId = setTimeout(() => {
      startTimeRef.current = null;
      animationFrame = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [targetValue, duration, delay]);

  return Number(displayValue.toFixed(decimals));
}

// ============================================================================
// Component
// ============================================================================

export default function MetricCard({
  label,
  naiveValue,
  optimizedValue,
  unit,
  lowerIsBetter = true,
  decimals = 1,
  icon,
  animationDuration = 1200,
  animationDelay = 0,
}: MetricCardProps) {
  const animatedNaive = useAnimatedCounter(naiveValue, animationDuration, animationDelay, decimals);
  const animatedOptimized = useAnimatedCounter(optimizedValue, animationDuration, animationDelay + 100, decimals);

  // Calculate improvement
  const diff = naiveValue - optimizedValue;
  const percentDiff = naiveValue !== 0 ? (diff / naiveValue) * 100 : 0;
  const isBetter = lowerIsBetter ? optimizedValue < naiveValue : optimizedValue > naiveValue;
  const isWorse = lowerIsBetter ? optimizedValue > naiveValue : optimizedValue < naiveValue;
  const isEqual = Math.abs(percentDiff) < 0.1;

  // Format improvement text
  const getImprovementText = useCallback(() => {
    if (isEqual) return 'Same';
    const _absDiff = Math.abs(diff); void _absDiff;
    const absPercent = Math.abs(percentDiff);

    if (lowerIsBetter) {
      return diff > 0
        ? `${absPercent.toFixed(1)}% less`
        : `${absPercent.toFixed(1)}% more`;
    } else {
      return diff < 0
        ? `${absPercent.toFixed(1)}% faster`
        : `${absPercent.toFixed(1)}% slower`;
    }
  }, [diff, percentDiff, lowerIsBetter, isEqual]);

  // Determine highlight style
  const getValueStyle = (isOptimized: boolean): React.CSSProperties => {
    const baseStyle = { ...styles.metricValue };
    if (isOptimized) {
      baseStyle.color = isBetter ? '#4ecdc4' : isWorse ? '#ff6b6b' : '#888';
    } else {
      baseStyle.color = '#ff6b6b';
    }
    return baseStyle;
  };

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        {icon && <span style={styles.icon}>{icon}</span>}
        <span style={styles.label}>{label}</span>
      </div>

      {/* Values */}
      <div style={styles.values}>
        {/* Naive */}
        <div style={styles.valueColumn}>
          <span style={styles.routeLabel}>Naive</span>
          <div style={styles.valueRow}>
            <span style={getValueStyle(false)}>
              {animatedNaive.toFixed(decimals)}
            </span>
            <span style={styles.unit}>{unit}</span>
          </div>
        </div>

        {/* Arrow */}
        <div style={styles.arrow}>
          <Arrow direction={isBetter ? 'down' : isWorse ? 'up' : 'equal'} />
        </div>

        {/* Optimized */}
        <div style={styles.valueColumn}>
          <span style={styles.routeLabel}>Optimized</span>
          <div style={styles.valueRow}>
            <span style={getValueStyle(true)}>
              {animatedOptimized.toFixed(decimals)}
            </span>
            <span style={styles.unit}>{unit}</span>
          </div>
        </div>
      </div>

      {/* Improvement Badge */}
      <div
        style={{
          ...styles.badge,
          backgroundColor: isBetter
            ? 'rgba(107, 203, 119, 0.2)'
            : isWorse
              ? 'rgba(255, 107, 107, 0.2)'
              : 'rgba(136, 136, 136, 0.2)',
          color: isBetter ? '#6bcb77' : isWorse ? '#ff6b6b' : '#888',
          borderColor: isBetter
            ? 'rgba(107, 203, 119, 0.3)'
            : isWorse
              ? 'rgba(255, 107, 107, 0.3)'
              : 'rgba(136, 136, 136, 0.3)',
        }}
      >
        {isBetter && <CheckIcon />}
        {isWorse && <WarningIcon />}
        <span>{getImprovementText()}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function Arrow({ direction }: { direction: 'up' | 'down' | 'equal' }) {
  if (direction === 'equal') {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="#888">
        <path d="M4 11h16v2H4z" />
      </svg>
    );
  }
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill={direction === 'down' ? '#6bcb77' : '#ff6b6b'}
      style={{ transform: direction === 'up' ? 'rotate(180deg)' : undefined }}
    >
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    borderTop: '1px solid #333',
    transition: 'transform 0.2s',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  values: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  valueColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  routeLabel: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 2,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  unit: {
    fontSize: 11,
    color: '#888',
    marginLeft: 2,
  },
  arrow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    padding: '4px 8px',
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 600,
    borderTop: '1px solid',
  },
};
