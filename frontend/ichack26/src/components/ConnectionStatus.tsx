/**
 * Connection status indicator component.
 *
 * Shows the WebSocket connection status and provides controls.
 */

import { useState, useEffect, useMemo } from 'react';
import { useScene } from '../context/SceneContext';
import type { ConnectionStatus as ConnectionStatusType } from '../types/api';

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
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
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
    paths,
    sceneBounds,
  } = useScene();

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
      // Fallback defaults if no bounds loaded yet
      return {
        simStart: [180, 50, 180] as [number, number, number],
        simEnd: [20, 50, 20] as [number, number, number],
      };
    }

    const { min, max, size } = sceneBounds;
    // Flying altitude: 70% of scene height, clamped to reasonable range
    const flyAltitude = Math.min(Math.max(min[1] + size[1] * 0.7, 50), max[1] - 10);
    // Margin from edges (10% of scene size or 50m, whichever is smaller)
    const marginX = Math.min(size[0] * 0.1, 50);
    const marginZ = Math.min(size[2] * 0.1, 50);

    return {
      simStart: [
        max[0] - marginX,  // Near max X
        flyAltitude,
        max[2] - marginZ,  // Near max Z
      ] as [number, number, number],
      simEnd: [
        min[0] + marginX,  // Near min X
        flyAltitude,
        min[2] + marginZ,  // Near min Z
      ] as [number, number, number],
    };
  }, [sceneBounds]);

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
              {sceneData ? `${sceneData.buildings.length} buildings` : 'Not loaded'}
            </span>
          </div>
          <div style={styles.dataRow}>
            <span style={styles.dataLabel}>Wind:</span>
            <span style={windFieldData ? styles.dataLoaded : styles.dataNotLoaded}>
              {windFieldData
                ? `${windFieldData.shape.join('x')} (${windFieldData.wind_vectors.length} vectors)`
                : 'Not loaded'}
            </span>
          </div>
        </div>
      )}

      {/* Simulation controls */}
      {isDataLoaded && (
        <div style={styles.simSection}>
          <div style={styles.sectionTitle}>Simulation</div>

          <div style={styles.coordRow}>
            <span style={styles.coordLabel}>Start:</span>
            <span style={styles.coordValue}>[{simStart.join(', ')}]</span>
          </div>
          <div style={styles.coordRow}>
            <span style={styles.coordLabel}>End:</span>
            <span style={styles.coordValue}>[{simEnd.join(', ')}]</span>
          </div>

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
            <div style={styles.simStatus}>
              <span style={styles.dataLabel}>Status:</span>
              <span style={styles.simStatusValue}>{simulation.status}</span>
            </div>
          )}

          {/* Path info */}
          {paths && (
            <div style={styles.pathInfo}>
              {paths.naive && (
                <div style={styles.pathRow}>
                  <span style={{ ...styles.pathDot, backgroundColor: '#ff6b6b' }} />
                  <span>Naive: {paths.naive.length} points</span>
                </div>
              )}
              {paths.optimized && (
                <div style={styles.pathRow}>
                  <span style={{ ...styles.pathDot, backgroundColor: '#4ecdc4' }} />
                  <span>Optimized: {paths.optimized.length} points</span>
                </div>
              )}
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
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
    minWidth: 220,
    maxWidth: 280,
    zIndex: 1000,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
  },
  statusLabel: {
    fontWeight: 600,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: 8,
    padding: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 4,
  },
  buttonRow: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  button: {
    padding: '6px 12px',
    border: '1px solid #555',
    borderRadius: 4,
    backgroundColor: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    transition: 'background-color 0.2s',
  },
  primaryButton: {
    backgroundColor: '#4a9eff',
    borderColor: '#4a9eff',
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
    fontSize: 12,
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
    color: '#4ecdc4',
  },
  coordRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 11,
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
    fontSize: 12,
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
