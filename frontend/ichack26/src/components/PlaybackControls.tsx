/**
 * Playback Controls component for simulation playback.
 *
 * Controls play/pause, speed, and restart for the simulation visualization.
 * Note: The simulation runs on the server - these controls affect local playback display.
 */

import { useCallback } from 'react';
import { useScene } from '../context/SceneContext';

// ============================================================================
// Types
// ============================================================================

export interface PlaybackState {
  isPlaying: boolean;
  speed: number;
}

interface PlaybackControlsProps {
  playbackState: PlaybackState;
  onPlaybackChange: (state: PlaybackState) => void;
  onRestart?: () => void;
}

// ============================================================================
// Speed Options
// ============================================================================

const SPEED_OPTIONS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
];

// ============================================================================
// Component
// ============================================================================

export default function PlaybackControls({
  playbackState,
  onPlaybackChange,
  onRestart,
}: PlaybackControlsProps) {
  const { simulation, currentFrame, startSimulation: _startSimulation, sceneBounds: _sceneBounds, paths } = useScene();
  void _startSimulation; void _sceneBounds; // Reserved for future use

  const { isPlaying, speed } = playbackState;

  // Toggle play/pause
  const handlePlayPause = useCallback(() => {
    onPlaybackChange({ ...playbackState, isPlaying: !isPlaying });
  }, [playbackState, isPlaying, onPlaybackChange]);

  // Change speed
  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      onPlaybackChange({ ...playbackState, speed: newSpeed });
    },
    [playbackState, onPlaybackChange]
  );

  // Get current time from frame
  const currentTime =
    currentFrame.naive?.time || currentFrame.optimized?.time || 0;

  // Check if simulation is active
  const _isSimulationActive =
    simulation.status === 'simulating' || simulation.status === 'paths_received';
  void _isSimulationActive; // Reserved for future use
  const isComplete = simulation.status === 'complete';

  // Calculate progress
  const naiveWaypoints = paths?.naive?.length || 1;
  const optimizedWaypoints = paths?.optimized?.length || 1;
  const naiveProgress = currentFrame.naive
    ? (currentFrame.naive.waypoint_index / naiveWaypoints) * 100
    : 0;
  const optimizedProgress = currentFrame.optimized
    ? (currentFrame.optimized.waypoint_index / optimizedWaypoints) * 100
    : 0;

  // Don't show if simulation hasn't started
  if (simulation.status === 'idle' || simulation.status === 'loading') {
    return null;
  }

  return (
    <div style={styles.container}>
      {/* Progress bars */}
      <div style={styles.progressSection}>
        {paths?.naive && (
          <div style={styles.progressRow}>
            <span style={{ ...styles.progressLabel, color: '#ff6b6b' }}>Naive</span>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${isComplete ? 100 : naiveProgress}%`,
                  backgroundColor: '#ff6b6b',
                }}
              />
            </div>
            <span style={styles.progressPercent}>
              {isComplete ? '100' : Math.round(naiveProgress)}%
            </span>
          </div>
        )}
        {paths?.optimized && (
          <div style={styles.progressRow}>
            <span style={{ ...styles.progressLabel, color: '#4ecdc4' }}>Optimized</span>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${isComplete ? 100 : optimizedProgress}%`,
                  backgroundColor: '#4ecdc4',
                }}
              />
            </div>
            <span style={styles.progressPercent}>
              {isComplete ? '100' : Math.round(optimizedProgress)}%
            </span>
          </div>
        )}
      </div>

      {/* Time display */}
      <div style={styles.timeDisplay}>
        <span style={styles.timeLabel}>Time:</span>
        <span style={styles.timeValue}>{currentTime.toFixed(1)}s</span>
      </div>

      {/* Playback buttons */}
      <div style={styles.controls}>
        {/* Play/Pause */}
        <button
          style={styles.playButton}
          onClick={handlePlayPause}
          disabled={isComplete}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        {/* Restart */}
        {onRestart && (
          <button
            style={styles.controlButton}
            onClick={onRestart}
            title="Restart simulation"
          >
            <RestartIcon />
          </button>
        )}

        {/* Speed selector */}
        <div style={styles.speedSelector}>
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option.value}
              style={{
                ...styles.speedButton,
                ...(speed === option.value ? styles.speedButtonActive : {}),
              }}
              onClick={() => handleSpeedChange(option.value)}
              title={`Set playback speed to ${option.label}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      {isComplete && (
        <div style={styles.completeIndicator}>
          Simulation Complete
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
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
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    padding: 12,
    zIndex: 1000,
    backdropFilter: 'blur(5px)',
    minWidth: 300,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  progressLabel: {
    width: 70,
    fontSize: 11,
    fontWeight: 500,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.1s ease-out',
  },
  progressPercent: {
    width: 36,
    textAlign: 'right',
    fontSize: 10,
    color: '#888',
  },
  timeDisplay: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    padding: '6px 0',
    borderTop: '1px solid #333',
    borderBottom: '1px solid #333',
  },
  timeLabel: {
    color: '#888',
  },
  timeValue: {
    fontFamily: 'monospace',
    fontWeight: 600,
    color: '#4a9eff',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  playButton: {
    width: 36,
    height: 36,
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
    borderRadius: 6,
    padding: 2,
  },
  speedButton: {
    padding: '6px 8px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  speedButtonActive: {
    backgroundColor: '#4a9eff',
    color: '#fff',
  },
  completeIndicator: {
    marginTop: 12,
    padding: '6px 10px',
    backgroundColor: 'rgba(107, 203, 119, 0.2)',
    borderRadius: 6,
    color: '#6bcb77',
    fontSize: 11,
    fontWeight: 600,
    textAlign: 'center',
  },
};
