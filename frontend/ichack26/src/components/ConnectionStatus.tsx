/**
 * Connection status indicator component.
 *
 * Shows the WebSocket connection status and provides controls.
 */

import { useState, useEffect, useMemo } from 'react';
import { useScene } from '../context/SceneContext';
import type { ConnectionStatus as ConnectionStatusType } from '../types/api';
// ControlPanel import removed - not currently used

// ============================================================================
// Status Indicator Styles
// ============================================================================

const STATUS_COLORS: Record<ConnectionStatusType, string> = {
  disconnected: '#ff6b6b',
  connecting: '#ffd93d',
  connected: '#6bcb77',
  error: '#ff6b6b',
};

const STATUS_LABELS: Record<ConnectionStatusType, string> = {
  disconnected: 'Tracr Disconnected',
  connecting: 'Connecting...',
  connected: 'Tracr Connected',
  error: 'Error',
};

// ============================================================================
// Component
// ============================================================================

export default function ConnectionStatus() {
  const {
    connectionStatus,
    connectionError,
    connect,
    disconnect,
    fetchSceneData,
    isDataLoaded,
    sceneData,
    windFieldData,
    simulation,
    startSimulation,
    paths: _paths,
    sceneBounds,
  } = useScene();
  void _paths; // Reserved for future use

  // Auto-fetch scene data when connected
  const [autoFetched, setAutoFetched] = useState(false);
  useEffect(() => {
    if (connectionStatus === 'connected' && !isDataLoaded && !autoFetched) {
      console.log('[ConnectionStatus] Auto-fetching scene data...');
      fetchSceneData(2);
      setAutoFetched(true);
    }
  }, [connectionStatus, isDataLoaded, autoFetched, fetchSceneData]);

  // Reset auto-fetch flag when disconnected
  useEffect(() => {
    if (connectionStatus === 'disconnected') {
      setAutoFetched(false);
    }
  }, [connectionStatus]);

  // Compute simulation endpoints from scene bounds
  // Place start and end at opposite corners, at a safe flying altitude
  const { simStart, simEnd } = useMemo(() => {
    if (!sceneBounds) {
      // Fallback defaults if no bounds loaded yet - start at east edge, end at west edge
      return {
        simStart: [170, 50, 100] as [number, number, number],
        simEnd: [30, 50, 100] as [number, number, number],
      };
    }

    const { min, max, center, size } = sceneBounds;
    // Flying altitude: 70% of scene height, clamped to reasonable range
    const flyAltitude = Math.min(Math.max(min[1] + size[1] * 0.7, 50), max[1] - 10);
    // Margin from edges (12% of scene size or 55m, whichever is smaller)
    const marginX = Math.min(size[0] * 0.12, 55);
    const marginZ = Math.min(size[2] * 0.12, 55);

    return {
      simStart: [
        max[0] - marginX,  // Near max X (east edge)
        flyAltitude,
        center[2],         // Center Z (avoid corners)
      ] as [number, number, number],
      simEnd: [
        min[0] + marginX,  // Near min X (west edge)
        flyAltitude,
        center[2],         // Center Z (avoid corners)
      ] as [number, number, number],
    };
  }, [sceneBounds]);

  // Auto-start simulation when data is loaded
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (isDataLoaded && sceneBounds && !autoStarted && simulation.status === 'idle') {
      console.log('[ConnectionStatus] Auto-starting simulation with:', { simStart, simEnd });
      setAutoStarted(true);
      startSimulation(simStart, simEnd, 'both');
    }
  }, [isDataLoaded, sceneBounds, autoStarted, simulation.status, simStart, simEnd, startSimulation]);

  const statusColor = STATUS_COLORS[connectionStatus];
  const statusLabel = STATUS_LABELS[connectionStatus];

  const handleStartSimulation = () => {
    startSimulation(simStart, simEnd, 'both');
  };

  return (
    <div style={styles.container}>
      {/* Status indicator */}
      <div style={styles.statusRow}>
        <div
          style={{
            ...styles.statusDot,
            backgroundColor: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
          }}
        />
        <span style={styles.statusLabel}>{statusLabel}</span>
      </div>

      {/* Error message */}
      {connectionError && (
        <div style={styles.error}>{connectionError}</div>
      )}

      {/* Connection controls */}
      <div style={styles.buttonRow}>
        {connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
          <button style={styles.button} onClick={connect}>
            Connect
          </button>
        ) : connectionStatus === 'connected' ? (
          <>
            <button style={styles.button} onClick={disconnect}>
              Disconnect
            </button>
            {!isDataLoaded && (
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={() => fetchSceneData(2)}
              >
                Load Scene
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Data status */}
      {connectionStatus === 'connected' && (
        <div style={styles.dataStatus}>
          <div style={styles.dataRow}>
            <span style={styles.dataLabel}>Scene:</span>
            <span style={sceneData ? styles.dataLoaded : styles.dataNotLoaded}>
              {sceneData
                ? 'Loaded'
                : 'Not loaded'
              }
            </span>
          </div>
          <div style={styles.dataRow}>
            <span style={styles.dataLabel}>Wind:</span>
            <span style={windFieldData ? styles.dataLoaded : styles.dataNotLoaded}>
              {windFieldData
                ? 'Loaded'
                : 'Not loaded'}
            </span>
          </div>
        </div>
      )}

      {/* Simulation controls */}
      {isDataLoaded && (
        <div style={styles.simSection}>
          <button
            style={{ ...styles.button, ...styles.primaryButton, marginTop: 8, width: '100%' }}
            onClick={handleStartSimulation}
            disabled={simulation.status === 'loading' || simulation.status === 'simulating'}
          >
            {simulation.status === 'loading' ? 'Loading...' :
              simulation.status === 'simulating' ? 'Simulating...' :
                'Start Simulation'}
          </button>

          {/* Simulation status */}
          {simulation.status !== 'idle' && (
            <div style={styles.activeSim}>
              <div style={styles.simStatus}>
                <span style={styles.dataLabel}>Status:</span>
                <span style={styles.simStatusValue}>{simulation.status}</span>
              </div>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    minWidth: 220,
    maxWidth: 280,
    zIndex: 1000,
    backdropFilter: 'blur(5px)',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  statusLabel: {
    fontWeight: 600,
    fontSize: 12,
  },
  activeSim: {
    alignContent: 'center',
    gap: 10
  },
  error: {
    color: '#ff6b6b',
    fontSize: 11,
    marginBottom: 8,
    padding: 6,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 4,
  },
  buttonRow: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
  },
  button: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'background-color 0.2s',
  },
  primaryButton: {
    backgroundColor: '#4a9eff',
  },
  dataStatus: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #333',
  },
  dataRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 11,
  },
  dataLabel: {
    color: '#888',
  },
  dataLoaded: {
    color: '#6bcb77',
  },
  dataNotLoaded: {
    color: '#888',
    fontStyle: 'italic',
  },
  simSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #333',
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: 8,
    color: '#fff',
    fontSize: 12,
  },
  coordRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 10,
  },
  coordLabel: {
    color: '#888',
  },
  coordValue: {
    color: '#aaa',
    fontFamily: 'monospace',
  },
  simStatus: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
    fontSize: 11,
  },
  simStatusValue: {
    color: '#ffd93d',
    textTransform: 'capitalize',
  },
  pathInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #333',
  },
  pathRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    marginBottom: 4,
  },
  pathDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
};
