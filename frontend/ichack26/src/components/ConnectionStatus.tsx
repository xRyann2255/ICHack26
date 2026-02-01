/**
 * Connection status indicator component.
 *
 * Shows the WebSocket connection status. Scene data auto-loads when connected.
 */

import { useEffect, useRef } from 'react';
import { useScene } from '../context/SceneContext';
import type { ConnectionStatus as ConnectionStatusType } from '../types/api';

// ============================================================================
// Constants
// ============================================================================

const RETRY_INTERVAL_MS = 2000; // Retry every 2 seconds until data is loaded

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
    fetchSceneData,
    isDataLoaded,
    sceneData,
    windFieldData,
  } = useScene();

  const retryIntervalRef = useRef<number | null>(null);

  // Auto-fetch scene data when connected, retry until loaded
  useEffect(() => {
    // Clear any existing interval
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }

    // Only retry if connected and data not loaded
    if (connectionStatus === 'connected' && !isDataLoaded) {
      // Fetch immediately
      console.log('[ConnectionStatus] Fetching scene data...');
      fetchSceneData(2);

      // Set up retry interval
      retryIntervalRef.current = window.setInterval(() => {
        if (!isDataLoaded) {
          console.log('[ConnectionStatus] Retrying scene data fetch...');
          fetchSceneData(2);
        }
      }, RETRY_INTERVAL_MS);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };
  }, [connectionStatus, isDataLoaded, fetchSceneData]);

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

      {/* Reconnect button when disconnected */}
      {(connectionStatus === 'disconnected' || connectionStatus === 'error') && (
        <button style={styles.button} onClick={connect}>
          Reconnect
        </button>
      )}

      {/* Data loading status */}
      {connectionStatus === 'connected' && (
        <div style={styles.dataStatus}>
          <div style={styles.dataRow}>
            <span style={styles.dataLabel}>Scene:</span>
            <span style={sceneData ? styles.dataLoaded : styles.dataLoading}>
              {sceneData ? 'Ready' : 'Loading...'}
            </span>
          </div>
          <div style={styles.dataRow}>
            <span style={styles.dataLabel}>Wind:</span>
            <span style={windFieldData ? styles.dataLoaded : styles.dataLoading}>
              {windFieldData ? 'Ready' : 'Loading...'}
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
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    minWidth: 160,
    zIndex: 1000,
    backdropFilter: 'blur(5px)',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
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
  error: {
    color: '#ff6b6b',
    fontSize: 11,
    marginTop: 8,
    padding: 6,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 4,
  },
  button: {
    marginTop: 8,
    padding: '6px 12px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'background-color 0.2s',
    width: '100%',
  },
  dataStatus: {
    marginTop: 10,
    paddingTop: 10,
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
  dataLoading: {
    color: '#ffd93d',
  },
};
