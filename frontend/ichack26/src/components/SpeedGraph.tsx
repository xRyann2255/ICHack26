/**
 * Speed Graph Component
 *
 * Displays a line graph comparing groundspeed over time
 * for both naive and optimized drone routes.
 */

import { useMemo, useState } from 'react';
import type { SpeedSample } from '../hooks/useWebSocket';

// ============================================================================
// Types
// ============================================================================

interface SpeedGraphProps {
  naiveData: SpeedSample[];
  optimizedData: SpeedSample[];
}

interface HoveredPoint {
  x: number;
  y: number;
  time: number;
  speed: number;
  route: 'naive' | 'optimized';
}

// ============================================================================
// Constants
// ============================================================================

const GRAPH_WIDTH = 800;
const GRAPH_HEIGHT = 400;
const PADDING = { top: 30, right: 30, bottom: 50, left: 60 };
const INNER_WIDTH = GRAPH_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = GRAPH_HEIGHT - PADDING.top - PADDING.bottom;

const NAIVE_COLOR = '#ff6b6b';
const OPTIMIZED_COLOR = '#4ecdc4';
const POINT_RADIUS = 7;
const HOVER_RADIUS = 10;
const POINT_INTERVAL = 10; // Show points every 10 seconds

// ============================================================================
// Helper Functions
// ============================================================================

function downsampleData(data: SpeedSample[], maxPoints: number): SpeedSample[] {
  if (data.length <= maxPoints) return data;

  const step = Math.ceil(data.length / maxPoints);
  const result: SpeedSample[] = [];

  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }

  // Always include last point
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }

  return result;
}

function getPointsAtInterval(data: SpeedSample[], intervalSeconds: number): SpeedSample[] {
  if (data.length === 0) return [];

  const result: SpeedSample[] = [];
  let nextTargetTime = 0;

  for (const sample of data) {
    if (sample.time >= nextTargetTime) {
      result.push(sample);
      nextTargetTime = Math.floor(sample.time / intervalSeconds) * intervalSeconds + intervalSeconds;
    }
  }

  // Always include the last point
  const lastSample = data[data.length - 1];
  if (result.length === 0 || result[result.length - 1].time !== lastSample.time) {
    result.push(lastSample);
  }

  return result;
}

function createLinePath(
  data: SpeedSample[],
  xScale: (t: number) => number,
  yScale: (v: number) => number
): string {
  if (data.length === 0) return '';

  return data
    .map((sample, i) => {
      const x = xScale(sample.time);
      const y = yScale(sample.groundspeed);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

function createAreaPath(
  data: SpeedSample[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
  baselineY: number
): string {
  if (data.length === 0) return '';

  const linePath = data
    .map((sample, i) => {
      const x = xScale(sample.time);
      const y = yScale(sample.groundspeed);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Close the path by going down to baseline and back to start
  const firstX = xScale(data[0].time);
  const lastX = xScale(data[data.length - 1].time);

  return `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
}

// ============================================================================
// Main Component
// ============================================================================

export default function SpeedGraph({ naiveData, optimizedData }: SpeedGraphProps) {
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);

  // Downsample for performance (max 100 points per line)
  const sampledNaive = useMemo(() => downsampleData(naiveData, 100), [naiveData]);
  const sampledOptimized = useMemo(() => downsampleData(optimizedData, 100), [optimizedData]);

  // Get points at 10s intervals for display
  const naivePoints = useMemo(() => getPointsAtInterval(sampledNaive, POINT_INTERVAL), [sampledNaive]);
  const optimizedPoints = useMemo(() => getPointsAtInterval(sampledOptimized, POINT_INTERVAL), [sampledOptimized]);

  // Calculate scales
  const { xScale, yScale, yTicks, xTicks } = useMemo(() => {
    const allData = [...sampledNaive, ...sampledOptimized];
    if (allData.length === 0) {
      return {
        xScale: () => PADDING.left,
        yScale: () => PADDING.top + INNER_HEIGHT,
        yTicks: [0, 5, 10],
        xTicks: [0, 5, 10],
      };
    }

    const maxT = Math.max(...allData.map(d => d.time), 1);
    const maxS = Math.max(...allData.map(d => d.groundspeed), 1) * 1.1; // 10% headroom

    const xScaleFn = (t: number) => PADDING.left + (t / maxT) * INNER_WIDTH;
    const yScaleFn = (v: number) => PADDING.top + INNER_HEIGHT - (v / maxS) * INNER_HEIGHT;

    // Generate tick values
    const yTickCount = 5;
    const yTickStep = maxS / yTickCount;
    const yTickValues = Array.from({ length: yTickCount + 1 }, (_, i) => i * yTickStep);

    const xTickCount = 6;
    const xTickStep = maxT / xTickCount;
    const xTickValues = Array.from({ length: xTickCount + 1 }, (_, i) => i * xTickStep);

    return {
      xScale: xScaleFn,
      yScale: yScaleFn,
      yTicks: yTickValues,
      xTicks: xTickValues,
    };
  }, [sampledNaive, sampledOptimized]);

  // Create paths
  const naivePath = useMemo(
    () => createLinePath(sampledNaive, xScale, yScale),
    [sampledNaive, xScale, yScale]
  );

  const optimizedPath = useMemo(
    () => createLinePath(sampledOptimized, xScale, yScale),
    [sampledOptimized, xScale, yScale]
  );

  // Create area paths for gradient fills
  const baselineY = PADDING.top + INNER_HEIGHT;

  const naiveAreaPath = useMemo(
    () => createAreaPath(sampledNaive, xScale, yScale, baselineY),
    [sampledNaive, xScale, yScale]
  );

  const optimizedAreaPath = useMemo(
    () => createAreaPath(sampledOptimized, xScale, yScale, baselineY),
    [sampledOptimized, xScale, yScale]
  );

  const hasData = sampledNaive.length > 0 || sampledOptimized.length > 0;

  const handlePointHover = (sample: SpeedSample, route: 'naive' | 'optimized') => {
    setHoveredPoint({
      x: xScale(sample.time),
      y: yScale(sample.groundspeed),
      time: sample.time,
      speed: sample.groundspeed,
      route,
    });
  };

  const handlePointLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div style={styles.container}>
      <svg
        width="100%"
        height={GRAPH_HEIGHT}
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        style={styles.svg}
      >
        {/* Gradient definitions */}
        <defs>
          <linearGradient id="naiveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={NAIVE_COLOR} stopOpacity="0.75" />
            <stop offset="100%" stopColor={NAIVE_COLOR} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="optimizedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={OPTIMIZED_COLOR} stopOpacity="0.75" />
            <stop offset="100%" stopColor={OPTIMIZED_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <g style={styles.grid}>
          {yTicks.map((tick) => (
            <line
              key={`y-${tick}`}
              x1={PADDING.left}
              y1={yScale(tick)}
              x2={PADDING.left + INNER_WIDTH}
              y2={yScale(tick)}
              stroke="#333"
              strokeDasharray="2,2"
            />
          ))}
          {xTicks.map((tick) => (
            <line
              key={`x-${tick}`}
              x1={xScale(tick)}
              y1={PADDING.top}
              x2={xScale(tick)}
              y2={PADDING.top + INNER_HEIGHT}
              stroke="#333"
              strokeDasharray="2,2"
            />
          ))}
        </g>

        {/* Axes */}
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + INNER_HEIGHT}
          stroke="#666"
          strokeWidth={1.5}
        />
        <line
          x1={PADDING.left}
          y1={PADDING.top + INNER_HEIGHT}
          x2={PADDING.left + INNER_WIDTH}
          y2={PADDING.top + INNER_HEIGHT}
          stroke="#666"
          strokeWidth={1.5}
        />

        {/* Y-axis labels */}
        {yTicks.map((tick) => (
          <text
            key={`y-label-${tick}`}
            x={PADDING.left - 10}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            style={styles.axisLabel}
          >
            {tick.toFixed(0)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((tick) => (
          <text
            key={`x-label-${tick}`}
            x={xScale(tick)}
            y={PADDING.top + INNER_HEIGHT + 18}
            textAnchor="middle"
            style={styles.axisLabel}
          >
            {tick.toFixed(1)}s
          </text>
        ))}

        {/* Axis titles */}
        <text
          x={PADDING.left + INNER_WIDTH / 2}
          y={GRAPH_HEIGHT - 8}
          textAnchor="middle"
          style={styles.axisTitle}
        >
          Time (s)
        </text>
        <text
          x={14}
          y={PADDING.top + INNER_HEIGHT / 2}
          textAnchor="middle"
          transform={`rotate(-90, 14, ${PADDING.top + INNER_HEIGHT / 2})`}
          style={styles.axisTitle}
        >
          Speed (m/s)
        </text>

        {/* Data area fills */}
        {hasData && (
          <>
            <path
              d={naiveAreaPath}
              fill="url(#naiveGradient)"
              stroke="none"
            />
            <path
              d={optimizedAreaPath}
              fill="url(#optimizedGradient)"
              stroke="none"
            />
          </>
        )}

        {/* Data lines */}
        {hasData && (
          <>
            <path
              d={naivePath}
              fill="none"
              stroke={NAIVE_COLOR}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={optimizedPath}
              fill="none"
              stroke={OPTIMIZED_COLOR}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Naive data points (every 10s) */}
            {naivePoints.map((sample, i) => (
              <circle
                key={`naive-${i}`}
                cx={xScale(sample.time)}
                cy={yScale(sample.groundspeed)}
                r={hoveredPoint?.route === 'naive' && hoveredPoint?.time === sample.time ? HOVER_RADIUS : POINT_RADIUS}
                fill={NAIVE_COLOR}
                stroke="#1a1a1a"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'r 0.1s ease' }}
                onMouseEnter={() => handlePointHover(sample, 'naive')}
                onMouseLeave={handlePointLeave}
              />
            ))}

            {/* Optimized data points (every 10s) */}
            {optimizedPoints.map((sample, i) => (
              <circle
                key={`optimized-${i}`}
                cx={xScale(sample.time)}
                cy={yScale(sample.groundspeed)}
                r={hoveredPoint?.route === 'optimized' && hoveredPoint?.time === sample.time ? HOVER_RADIUS : POINT_RADIUS}
                fill={OPTIMIZED_COLOR}
                stroke="#1a1a1a"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'r 0.1s ease' }}
                onMouseEnter={() => handlePointHover(sample, 'optimized')}
                onMouseLeave={handlePointLeave}
              />
            ))}
          </>
        )}

        {/* Tooltip */}
        {hoveredPoint && (
          <g>
            {/* Tooltip background */}
            <rect
              x={hoveredPoint.x + 12}
              y={hoveredPoint.y - 45}
              width={110}
              height={38}
              rx={5}
              fill="rgba(0, 0, 0, 0.9)"
              stroke={hoveredPoint.route === 'naive' ? NAIVE_COLOR : OPTIMIZED_COLOR}
              strokeWidth={2}
            />
            {/* Tooltip text */}
            <text
              x={hoveredPoint.x + 22}
              y={hoveredPoint.y - 25}
              style={styles.tooltipText}
            >
              {hoveredPoint.speed.toFixed(2)} m/s
            </text>
            <text
              x={hoveredPoint.x + 22}
              y={hoveredPoint.y - 10}
              style={styles.tooltipSubtext}
            >
              t = {hoveredPoint.time.toFixed(1)}s
            </text>
          </g>
        )}

        {/* No data message */}
        {!hasData && (
          <text
            x={PADDING.left + INNER_WIDTH / 2}
            y={PADDING.top + INNER_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            style={styles.noData}
          >
            No speed data yet
          </text>
        )}
      </svg>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: NAIVE_COLOR }} />
          <span>Naive ({naivePoints.length} points)</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: OPTIMIZED_COLOR }} />
          <span>Optimized ({optimizedPoints.length} points)</span>
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
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    alignItems: 'center',
    padding: '16px',
  },
  svg: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 6,
  },
  grid: {
    opacity: 0.5,
  },
  axisLabel: {
    fontSize: 12,
    fill: '#888',
    fontFamily: 'monospace',
  },
  axisTitle: {
    fontSize: 13,
    fill: '#aaa',
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 500,
  },
  tooltipText: {
    fontSize: 13,
    fill: '#fff',
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  tooltipSubtext: {
    fontSize: 11,
    fill: '#999',
    fontFamily: 'monospace',
  },
  noData: {
    fontSize: 16,
    fill: '#666',
    fontFamily: 'system-ui, sans-serif',
  },
  legend: {
    display: 'flex',
    gap: 24,
    marginTop: 16,
    fontSize: 12,
    color: '#aaa',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  legendColor: {
    width: 16,
    height: 5,
    borderRadius: 2,
  },
};
