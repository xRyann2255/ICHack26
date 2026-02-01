/**
 * Collapsible Sidebar component that groups Control Panel, Playback, and Visibility toggles.
 * Each section is expandable/collapsible, minimized by default.
 * Anchored to center-right of the screen.
 */

import { useState, useCallback } from 'react';
import { useScene } from '../context/SceneContext';
import type { VisibilityState } from './VisibilityToggles';

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

interface CollapsibleSidebarProps {
  visibility: VisibilityState;
  onVisibilityChange: (visibility: VisibilityState) => void;
  onRestart?: () => void;
  /** Current wind direction index (0-15) */
  windDirection?: number;
  /** Callback when wind direction changes */
  onWindDirectionChange?: (directionIndex: number) => void;
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
];

// ============================================================================
// Toggle Configuration
// ============================================================================

interface ToggleConfig {
  key: keyof VisibilityState;
  label: string;
  color: string;
}

const VISIBILITY_TOGGLES: ToggleConfig[] = [
  { key: 'terrain', label: 'Terrain', color: '#667788' },
  { key: 'windField', label: 'Wind Field', color: '#4a9eff' },
  { key: 'naivePath', label: 'Naive Path', color: '#ff6b6b' },
  { key: 'optimizedPath', label: 'Optimized Path', color: '#4ecdc4' },
  { key: 'naiveDrone', label: 'Naive Drone', color: '#ff6b6b' },
  { key: 'optimizedDrone', label: 'Optimized Drone', color: '#4ecdc4' },
  { key: 'effects', label: 'Effects', color: '#bf7fff' },
];

// ============================================================================
// Speed Options
// ============================================================================

const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
];

// ============================================================================
// Wind Direction Options (16 compass points, 22.5° apart)
// ============================================================================

export interface WindDirection {
  label: string;
  shortLabel: string;
  degrees: number;
}

export const WIND_DIRECTIONS: WindDirection[] = [
  { label: 'North', shortLabel: 'N', degrees: 0 },
  { label: 'North-Northeast', shortLabel: 'NNE', degrees: 22.5 },
  { label: 'Northeast', shortLabel: 'NE', degrees: 45 },
  { label: 'East-Northeast', shortLabel: 'ENE', degrees: 67.5 },
  { label: 'East', shortLabel: 'E', degrees: 90 },
  { label: 'East-Southeast', shortLabel: 'ESE', degrees: 112.5 },
  { label: 'Southeast', shortLabel: 'SE', degrees: 135 },
  { label: 'South-Southeast', shortLabel: 'SSE', degrees: 157.5 },
  { label: 'South', shortLabel: 'S', degrees: 180 },
  { label: 'South-Southwest', shortLabel: 'SSW', degrees: 202.5 },
  { label: 'Southwest', shortLabel: 'SW', degrees: 225 },
  { label: 'West-Southwest', shortLabel: 'WSW', degrees: 247.5 },
  { label: 'West', shortLabel: 'W', degrees: 270 },
  { label: 'West-Northwest', shortLabel: 'WNW', degrees: 292.5 },
  { label: 'Northwest', shortLabel: 'NW', degrees: 315 },
  { label: 'North-Northwest', shortLabel: 'NNW', degrees: 337.5 },
];

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, isExpanded, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={onToggle}>
        <div style={styles.sectionHeaderLeft}>
          <span style={styles.sectionIcon}>{icon}</span>
          <span style={styles.sectionTitle}>{title}</span>
        </div>
        <span style={styles.expandIcon}>{isExpanded ? '−' : '+'}</span>
      </div>
      {isExpanded && <div style={styles.sectionContent}>{children}</div>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function CollapsibleSidebar({
  visibility,
  onVisibilityChange,
  onRestart,
  windDirection = 0,
  onWindDirectionChange,
}: CollapsibleSidebarProps) {
  const {
    sceneBounds,
    simulation,
    startSimulation,
    connectionStatus,
    currentFrame,
    playback,
    setPlaybackPaused,
    setPlaybackSpeed,
  } = useScene();

  // Expansion states - all minimized by default
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [playbackExpanded, setPlaybackExpanded] = useState(false);
  const [windExpanded, setWindExpanded] = useState(false);

  // Local wind direction state (used if no callback provided)
  const [localWindDirection, setLocalWindDirection] = useState(windDirection);
  const currentWindDirection = onWindDirectionChange ? windDirection : localWindDirection;

  const handleWindDirectionChange = useCallback((index: number) => {
    if (onWindDirectionChange) {
      onWindDirectionChange(index);
    } else {
      setLocalWindDirection(index);
    }
  }, [onWindDirectionChange]);

  // Control Panel state
  const [startPos, setStartPos] = useState<Position>({ x: 180, y: 180, z: 50 });
  const [endPos, setEndPos] = useState<Position>({ x: 20, y: 20, z: 50 });
  const [routeType, setRouteType] = useState<RouteType>('both');

  // Compute dynamic presets based on scene bounds
  const presets = sceneBounds
    ? (() => {
      const { min, max, center, size } = sceneBounds;
      const flyAltitude = Math.min(Math.max(min[1] + size[1] * 0.7, 50), max[1] - 10);
      const marginX = Math.min(size[0] * 0.1, 50);
      const marginZ = Math.min(size[2] * 0.1, 50);
      return [
        {
          name: 'Cross City',
          description: 'Diagonal path',
          start: { x: max[0] - marginX, y: flyAltitude, z: max[2] - marginZ },
          end: { x: min[0] + marginX, y: flyAltitude, z: min[2] + marginZ },
        },
        {
          name: 'East-West',
          description: 'Horizontal path',
          start: { x: max[0] - marginX, y: flyAltitude, z: center[2] },
          end: { x: min[0] + marginX, y: flyAltitude, z: center[2] },
        },
        {
          name: 'North-South',
          description: 'Vertical path',
          start: { x: center[0], y: flyAltitude, z: max[2] - marginZ },
          end: { x: center[0], y: flyAltitude, z: min[2] + marginZ },
        },
      ];
    })()
    : DEFAULT_PRESETS;

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

  // Visibility toggle handler
  const handleVisibilityToggle = useCallback(
    (key: keyof VisibilityState) => {
      onVisibilityChange({ ...visibility, [key]: !visibility[key] });
    },
    [visibility, onVisibilityChange]
  );

  // Playback handlers - using context
  const handlePlayPause = useCallback(() => {
    setPlaybackPaused(!playback.isPaused);
  }, [playback.isPaused, setPlaybackPaused]);

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setPlaybackSpeed(newSpeed);
    },
    [setPlaybackSpeed]
  );

  const canStart =
    connectionStatus === 'connected' &&
    simulation.status !== 'loading' &&
    simulation.status !== 'simulating';

  const isSimulationActive =
    simulation.status === 'simulating' || simulation.status === 'paths_received';
  const isComplete = simulation.status === 'complete';

  const currentTime = currentFrame.naive?.time || currentFrame.optimized?.time || 0;

  return (
    <div style={styles.container}>
      {/* Route Controls Section */}
      <CollapsibleSection
        title="Route Controls"
        icon={<RouteIcon />}
        isExpanded={controlsExpanded}
        onToggle={() => setControlsExpanded(!controlsExpanded)}
      >
        {/* Presets */}
        <div style={styles.subsection}>
          <div style={styles.subsectionTitle}>Presets</div>
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
        <div style={styles.subsection}>
          <div style={styles.subsectionTitle}>Start Position</div>
          <div style={styles.positionInputs}>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>X</label>
              <input
                type="number"
                style={styles.input}
                value={startPos.x}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setStartPos(prev => ({ ...prev, x: val }));
                }}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Y</label>
              <input
                type="number"
                style={styles.input}
                value={startPos.y}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setStartPos(prev => ({ ...prev, y: val }));
                }}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Z</label>
              <input
                type="number"
                style={styles.input}
                value={startPos.z}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setStartPos(prev => ({ ...prev, z: val }));
                }}
              />
            </div>
          </div>
        </div>

        {/* End Position */}
        <div style={styles.subsection}>
          <div style={styles.subsectionTitle}>End Position</div>
          <div style={styles.positionInputs}>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>X</label>
              <input
                type="number"
                style={styles.input}
                value={endPos.x}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setEndPos(prev => ({ ...prev, x: val }));
                }}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Y</label>
              <input
                type="number"
                style={styles.input}
                value={endPos.y}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setEndPos(prev => ({ ...prev, y: val }));
                }}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Z</label>
              <input
                type="number"
                style={styles.input}
                value={endPos.z}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setEndPos(prev => ({ ...prev, z: val }));
                }}
              />
            </div>
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
              ? 'Running...'
              : 'Start Simulation'}
        </button>

        {/* Status indicator */}
        {simulation.status !== 'idle' && (
          <div style={styles.statusIndicator}>
            <span style={getStatusDotStyle(simulation.status)} />
            <span style={styles.statusText}>
              {simulation.status === 'paths_received'
                ? 'Paths Received'
                : simulation.status.charAt(0).toUpperCase() + simulation.status.slice(1)}
            </span>
          </div>
        )}
      </CollapsibleSection>

      {/* Playback Section */}
      <CollapsibleSection
        title="Playback"
        icon={<PlaybackIcon />}
        isExpanded={playbackExpanded}
        onToggle={() => setPlaybackExpanded(!playbackExpanded)}
      >
        {/* Time display */}
        <div style={styles.timeDisplay}>
          <span style={styles.timeLabel}>Time:</span>
          <span style={styles.timeValue}>{currentTime.toFixed(1)}s</span>
        </div>

        {/* Playback controls */}
        <div style={styles.playbackControls}>
          <button
            style={styles.playButton}
            onClick={handlePlayPause}
            disabled={!isSimulationActive && !isComplete}
            title={playback.isPaused ? 'Play' : 'Pause'}
          >
            {playback.isPaused ? <PlayIcon /> : <PauseIcon />}
          </button>

          {onRestart && (
            <button
              style={styles.controlButton}
              onClick={onRestart}
              title="Restart"
            >
              <RestartIcon />
            </button>
          )}

          <div style={styles.speedSelector}>
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option.value}
                style={{
                  ...styles.speedButton,
                  ...(playback.speed === option.value ? styles.speedButtonActive : {}),
                }}
                onClick={() => handleSpeedChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {isComplete && (
          <div style={styles.completeIndicator}>Complete</div>
        )}
      </CollapsibleSection>

      {/* Wind Direction Section */}
      <CollapsibleSection
        title="Wind Direction"
        icon={<WindIcon />}
        isExpanded={windExpanded}
        onToggle={() => setWindExpanded(!windExpanded)}
      >
        {/* Compass display */}
        <div style={styles.compassContainer}>
          <div style={styles.compass}>
            {/* Compass rose background */}
            <div style={styles.compassRose}>
              {/* Cardinal direction labels */}
              <span style={{ ...styles.compassLabel, top: 2, left: '50%', transform: 'translateX(-50%)' }}>N</span>
              <span style={{ ...styles.compassLabel, right: 2, top: '50%', transform: 'translateY(-50%)' }}>E</span>
              <span style={{ ...styles.compassLabel, bottom: 2, left: '50%', transform: 'translateX(-50%)' }}>S</span>
              <span style={{ ...styles.compassLabel, left: 2, top: '50%', transform: 'translateY(-50%)' }}>W</span>
            </div>

            {/* Direction buttons arranged in a circle */}
            {WIND_DIRECTIONS.map((dir, index) => {
              const angle = (dir.degrees - 90) * (Math.PI / 180); // -90 to start from top
              const radius = 38; // Distance from center
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const isSelected = currentWindDirection === index;

              return (
                <button
                  key={dir.shortLabel}
                  style={{
                    ...styles.compassPoint,
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: isSelected ? '#4a9eff' : 'rgba(255,255,255,0.1)',
                    borderColor: isSelected ? '#4a9eff' : 'rgba(255,255,255,0.2)',
                  }}
                  onClick={() => handleWindDirectionChange(index)}
                  title={`${dir.label} (${dir.degrees}°)`}
                >
                  {index % 2 === 0 ? dir.shortLabel : ''}
                </button>
              );
            })}

            {/* Center indicator showing current direction */}
            <div style={styles.compassCenter}>
              <div
                style={{
                  ...styles.compassArrow,
                  transform: `rotate(${WIND_DIRECTIONS[currentWindDirection].degrees}deg)`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Current direction label */}
        <div style={styles.windDirectionLabel}>
          <span style={styles.windDirectionText}>
            {WIND_DIRECTIONS[currentWindDirection].label}
          </span>
          <span style={styles.windDirectionDegrees}>
            {WIND_DIRECTIONS[currentWindDirection].degrees}°
          </span>
        </div>
      </CollapsibleSection>

    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusDotStyle(status: string): React.CSSProperties {
  return {
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
  };
}

// ============================================================================
// Icons
// ============================================================================

function RouteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
    </svg>
  );
}

function PlaybackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function VisibilityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
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
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 1000,
    width: 220,
  },
  section: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    backdropFilter: 'blur(5px)',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: 600,
    fontSize: 12,
    color: '#fff',
  },
  expandIcon: {
    fontSize: 14,
    color: '#888',
    fontWeight: 300,
  },
  sectionContent: {
    padding: '0 12px 12px',
    borderTop: '1px solid #333',
  },
  subsection: {
    marginTop: 12,
  },
  subsectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 6,
  },
  presetGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  presetButton: {
    padding: '6px 8px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 10,
    transition: 'all 0.2s',
  },
  positionInputs: {
    display: 'flex',
    gap: 6,
  },
  inputGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  inputLabel: {
    fontSize: 9,
    color: '#888',
    fontWeight: 500,
  },
  input: {
    padding: '5px 6px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: 11,
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
    padding: '6px 8px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#888',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  routeTypeButtonActive: {
    backgroundColor: '#4a9eff',
    color: '#fff',
  },
  startButton: {
    width: '100%',
    padding: '8px',
    border: 'none',
    borderRadius: 6,
    backgroundColor: '#4ecdc4',
    color: '#000',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.2s',
    marginTop: 12,
  },
  startButtonDisabled: {
    backgroundColor: '#333',
    color: '#888',
    cursor: 'not-allowed',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: '6px 8px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    color: '#ccc',
  },
  timeDisplay: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 0',
    marginTop: 8,
  },
  timeLabel: {
    color: '#888',
    fontSize: 11,
  },
  timeValue: {
    fontFamily: 'monospace',
    fontWeight: 600,
    color: '#4a9eff',
    fontSize: 12,
  },
  playbackControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playButton: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#4a9eff',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  controlButton: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ccc',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  speedSelector: {
    display: 'flex',
    gap: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
    padding: 2,
  },
  speedButton: {
    padding: '4px 6px',
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 9,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  speedButtonActive: {
    backgroundColor: '#4a9eff',
    color: '#fff',
  },
  completeIndicator: {
    marginTop: 8,
    padding: '6px 8px',
    backgroundColor: 'rgba(107, 203, 119, 0.2)',
    borderRadius: 4,
    color: '#6bcb77',
    fontSize: 10,
    fontWeight: 600,
    textAlign: 'center',
  },
  toggleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 10,
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
  },
  toggleSwitch: {
    width: 30,
    height: 16,
    borderRadius: 8,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 11,
    transition: 'color 0.2s',
  },
  // Compass styles
  compassContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 0',
  },
  compass: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  compassRose: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  compassLabel: {
    position: 'absolute',
    fontSize: 9,
    color: '#666',
    fontWeight: 600,
  },
  compassPoint: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '1px solid',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 7,
    fontWeight: 600,
    color: '#fff',
    transition: 'all 0.15s',
    padding: 0,
  },
  compassCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 30,
    height: 30,
    borderRadius: '50%',
    backgroundColor: 'rgba(74, 158, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassArrow: {
    width: 0,
    height: 0,
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderBottom: '20px solid #4a9eff',
    transformOrigin: 'center 15px',
    transition: 'transform 0.3s ease-out',
  },
  windDirectionLabel: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 8,
    paddingBottom: 8,
  },
  windDirectionText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 500,
  },
  windDirectionDegrees: {
    fontSize: 10,
    color: '#4a9eff',
    fontFamily: 'monospace',
  },
};
