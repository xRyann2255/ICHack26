/**
 * Control Panel component for simulation settings.
 *
 * Provides input fields for start/end positions, preset routes,
 * route type selection, and simulation control buttons.
 */

import { useState, useMemo, useCallback } from 'react';
import { useScene } from '../context/SceneContext';

// ============================================================================
// Types
// ============================================================================

export type RouteType = 'naive' | 'optimized' | 'both';

interface Position {
  x: number;
  y: number;
  z: number;
}

interface RoutePreset {
  name: string;
  description: string;
  start: Position;
  end: Position;
}

// ============================================================================
// Preset Routes
// ============================================================================

const DEFAULT_PRESETS: RoutePreset[] = [
  {
    name: 'Cross City',
    description: 'Diagonal path across the scene',
    start: { x: 180, y: 180, z: 50 },
    end: { x: 20, y: 20, z: 50 },
  },
  {
    name: 'East-West',
    description: 'Horizontal path through center',
    start: { x: 180, y: 100, z: 50 },
    end: { x: 20, y: 100, z: 50 },
  },
  {
    name: 'North-South',
    description: 'Vertical path through center',
    start: { x: 100, y: 180, z: 50 },
    end: { x: 100, y: 20, z: 50 },
  },
  {
    name: 'Low Altitude',
    description: 'Low flight path',
    start: { x: 180, y: 180, z: 30 },
    end: { x: 20, y: 20, z: 30 },
  },
];

// ============================================================================
// Component
// ============================================================================

export default function ControlPanel() {
  const {
    sceneBounds,
    simulation,
    startSimulation,
    isDataLoaded,
    connectionStatus,
  } = useScene();

  // Position state
  const [startPos, setStartPos] = useState<Position>({ x: 180, y: 180, z: 50 });
  const [endPos, setEndPos] = useState<Position>({ x: 20, y: 20, z: 50 });
  const [routeType, setRouteType] = useState<RouteType>('both');
  const [isExpanded, setIsExpanded] = useState(true);

  // Compute dynamic presets based on scene bounds
  const presets = useMemo<RoutePreset[]>(() => {
    if (!sceneBounds) return DEFAULT_PRESETS;

    const { min, max, center, size } = sceneBounds;
    const flyAltitude = Math.min(Math.max(min[1] + size[1] * 0.7, 50), max[1] - 10);
    const marginX = Math.min(size[0] * 0.1, 50);
    const marginZ = Math.min(size[2] * 0.1, 50);

    return [
      {
        name: 'Cross City',
        description: 'Diagonal path across the scene',
        start: { x: max[0] - marginX, y: flyAltitude, z: max[2] - marginZ },
        end: { x: min[0] + marginX, y: flyAltitude, z: min[2] + marginZ },
      },
      {
        name: 'East-West',
        description: 'Horizontal path through center',
        start: { x: max[0] - marginX, y: flyAltitude, z: center[2] },
        end: { x: min[0] + marginX, y: flyAltitude, z: center[2] },
      },
      {
        name: 'North-South',
        description: 'Vertical path through center',
        start: { x: center[0], y: flyAltitude, z: max[2] - marginZ },
        end: { x: center[0], y: flyAltitude, z: min[2] + marginZ },
      },
      {
        name: 'Low Altitude',
        description: 'Low flight path (30m)',
        start: { x: max[0] - marginX, y: 30, z: max[2] - marginZ },
        end: { x: min[0] + marginX, y: 30, z: min[2] + marginZ },
      },
      {
        name: 'High Altitude',
        description: 'High flight path (near max)',
        start: { x: max[0] - marginX, y: max[1] - 20, z: max[2] - marginZ },
        end: { x: min[0] + marginX, y: max[1] - 20, z: min[2] + marginZ },
      },
    ];
  }, [sceneBounds]);

  // Handle preset selection
  const applyPreset = useCallback((preset: RoutePreset) => {
    setStartPos(preset.start);
    setEndPos(preset.end);
  }, []);

  // Handle start simulation
  const handleStart = useCallback(() => {
    startSimulation(
      [startPos.x, startPos.y, startPos.z],
      [endPos.x, endPos.y, endPos.z],
      routeType
    );
  }, [startSimulation, startPos, endPos, routeType]);

  // Parse position input
  const handlePositionChange = (
    setter: React.Dispatch<React.SetStateAction<Position>>,
    axis: 'x' | 'y' | 'z',
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setter((prev) => ({ ...prev, [axis]: numValue }));
    }
  };

  const canStart =
    connectionStatus === 'connected' &&
    isDataLoaded &&
    simulation.status !== 'loading' &&
    simulation.status !== 'simulating';

  return (
    <div style={styles.container}>
      {/* Header with collapse toggle */}
      <div style={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <span style={styles.title}>Route Controls</span>
        <span style={styles.collapseIcon}>{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && (
        <div style={styles.content}>
          {/* Route Presets */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Presets</div>
            <div style={styles.presetGrid}>
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  style={styles.presetButton}
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Start Position */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Start Position</div>
            <div style={styles.positionInputs}>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>X</label>
                <input
                  type="number"
                  style={styles.input}
                  value={startPos.x}
                  onChange={(e) => handlePositionChange(setStartPos, 'x', e.target.value)}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Y</label>
                <input
                  type="number"
                  style={styles.input}
                  value={startPos.y}
                  onChange={(e) => handlePositionChange(setStartPos, 'y', e.target.value)}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Z</label>
                <input
                  type="number"
                  style={styles.input}
                  value={startPos.z}
                  onChange={(e) => handlePositionChange(setStartPos, 'z', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* End Position */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>End Position</div>
            <div style={styles.positionInputs}>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>X</label>
                <input
                  type="number"
                  style={styles.input}
                  value={endPos.x}
                  onChange={(e) => handlePositionChange(setEndPos, 'x', e.target.value)}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Y</label>
                <input
                  type="number"
                  style={styles.input}
                  value={endPos.y}
                  onChange={(e) => handlePositionChange(setEndPos, 'y', e.target.value)}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Z</label>
                <input
                  type="number"
                  style={styles.input}
                  value={endPos.z}
                  onChange={(e) => handlePositionChange(setEndPos, 'z', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Route Type */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Route Type</div>
            <div style={styles.routeTypeButtons}>
              {(['both', 'naive', 'optimized'] as RouteType[]).map((type) => (
                <button
                  key={type}
                  style={{
                    ...styles.routeTypeButton,
                    ...(routeType === type ? styles.routeTypeButtonActive : {}),
                  }}
                  onClick={() => setRouteType(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button
            style={{
              ...styles.startButton,
              ...(canStart ? {} : styles.startButtonDisabled),
            }}
            onClick={handleStart}
            disabled={!canStart}
          >
            {simulation.status === 'loading'
              ? 'Loading...'
              : simulation.status === 'simulating'
              ? 'Simulating...'
              : 'Start Simulation'}
          </button>

          {/* Status indicator */}
          {simulation.status !== 'idle' && (
            <div style={styles.statusIndicator}>
              <span style={styles.statusDot(simulation.status)} />
              <span style={styles.statusText}>
                {simulation.status === 'paths_received'
                  ? 'Paths Received'
                  : simulation.status.charAt(0).toUpperCase() + simulation.status.slice(1)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties | ((status: string) => React.CSSProperties)> = {
  container: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 10,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    minWidth: 280,
    maxWidth: 320,
    zIndex: 1000,
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#4ecdc4',
  },
  collapseIcon: {
    fontSize: 10,
    color: '#888',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
  },
  presetButton: {
    padding: '8px 10px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'all 0.2s',
  },
  positionInputs: {
    display: 'flex',
    gap: 8,
  },
  inputGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: 500,
  },
  input: {
    padding: '6px 8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    width: '100%',
    boxSizing: 'border-box',
  },
  routeTypeButtons: {
    display: 'flex',
    gap: 4,
  },
  routeTypeButton: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  routeTypeButtonActive: {
    backgroundColor: '#4a9eff',
    borderColor: '#4a9eff',
    color: '#fff',
  },
  startButton: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#4ecdc4',
    color: '#000',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s',
    marginTop: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#333',
    color: '#666',
    cursor: 'not-allowed',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
  },
  statusDot: (status: string): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor:
      status === 'complete'
        ? '#6bcb77'
        : status === 'simulating'
        ? '#ffd93d'
        : status === 'paths_received'
        ? '#4a9eff'
        : '#888',
  }),
  statusText: {
    fontSize: 12,
    color: '#ccc',
  },
};
