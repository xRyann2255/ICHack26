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
}: CollapsibleSidebarProps) {
  const {
    sceneBounds,
    simulation,
    startSimulation,
    isDataLoaded,
    connectionStatus,
    currentFrame,
    playback,
    setPlaybackPaused,
    setPlaybackSpeed,
  } = useScene();

  // Expansion states - all minimized by default
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [playbackExpanded, setPlaybackExpanded] = useState(false);
  const [visibilityExpanded, setVisibilityExpanded] = useState(false);

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
    isDataLoaded &&
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 10,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    color: '#4ecdc4',
    display: 'flex',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: 600,
    fontSize: 13,
    color: '#fff',
  },
  expandIcon: {
    fontSize: 16,
    color: '#666',
    fontWeight: 300,
  },
  sectionContent: {
    padding: '0 14px 14px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  subsection: {
    marginTop: 12,
  },
  subsectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
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
    padding: '6px 10px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    color: '#666',
    fontWeight: 500,
  },
  input: {
    padding: '5px 6px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
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
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 10,
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
    padding: '10px',
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
    color: '#666',
    cursor: 'not-allowed',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: '6px 10px',
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
    padding: '10px 0',
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
    width: 32,
    height: 32,
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
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    backgroundColor: 'transparent',
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
    marginTop: 10,
    padding: '6px 10px',
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
    width: 32,
    height: 18,
    borderRadius: 9,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    width: 14,
    height: 14,
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
};
