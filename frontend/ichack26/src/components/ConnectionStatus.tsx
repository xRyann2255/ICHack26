/**
 * Connection status indicator component.
 *
 * Shows the WebSocket connection status and provides controls.
 */

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
  } = useScene();

  const statusColor = STATUS_COLORS[connectionStatus];
  const statusLabel = STATUS_LABELS[connectionStatus];

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
    minWidth: 200,
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
};
