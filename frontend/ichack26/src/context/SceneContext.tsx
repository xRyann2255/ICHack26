/**
 * Scene Context - Global state for scene data and WebSocket connection.
 *
 * Provides scene data, wind field, and simulation state to all components.
 */

import { createContext, useContext, type ReactNode, useMemo, useCallback } from 'react';
import { useWebSocket, type SimulationState, type PlaybackControl } from '../hooks/useWebSocket';
import type {
  ConnectionStatus,
  SceneData,
  WindFieldData,
  FrameData,
  PathsData,
  RouteMetrics,
} from '../types/api';

// ============================================================================
// Context Types
// ============================================================================

export interface SceneContextValue {
  // Connection
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  connect: () => void;
  disconnect: () => void;

  // Scene data
  sceneData: SceneData | null;
  windFieldData: WindFieldData | null;
  isDataLoaded: boolean;

  // Data fetching
  fetchSceneData: (downsample?: number) => void;

  // Simulation
  simulation: SimulationState;
  paths: PathsData | null;
  currentFrame: {
    naive: FrameData | null;
    optimized: FrameData | null;
  };
  metrics: {
    naive: RouteMetrics | null;
    optimized: RouteMetrics | null;
  };

  // Simulation control
  startSimulation: (
    start: [number, number, number],
    end: [number, number, number],
    routeType?: 'naive' | 'optimized' | 'both'
  ) => void;

  // Playback control
  playback: PlaybackControl;
  setPlaybackPaused: (paused: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;

  // Computed helpers
  sceneBounds: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
  } | null;
}

// ============================================================================
// Context Creation
// ============================================================================

const SceneContext = createContext<SceneContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

export interface SceneProviderProps {
  children: ReactNode;
  wsUrl?: string;
  autoConnect?: boolean;
}

export function SceneProvider({
  children,
  wsUrl = 'ws://localhost:8765',
  autoConnect = true,
}: SceneProviderProps) {
  const ws = useWebSocket({
    url: wsUrl,
    autoConnect,
  });

  // Fetch scene and wind field data
  const fetchSceneData = useCallback(
    (downsample = 2) => {
      console.log('[SceneContext] Fetching scene data...');
      ws.requestAll(downsample);
    },
    [ws]
  );

  // Compute scene bounds helper
  const sceneBounds = useMemo(() => {
    if (!ws.sceneData) return null;

    const { min, max } = ws.sceneData.bounds;
    return {
      min,
      max,
      center: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ] as [number, number, number],
      size: [
        max[0] - min[0],
        max[1] - min[1],
        max[2] - min[2],
      ] as [number, number, number],
    };
  }, [ws.sceneData]);

  // Build context value
  const value = useMemo<SceneContextValue>(
    () => ({
      // Connection
      connectionStatus: ws.status,
      connectionError: ws.error,
      connect: ws.connect,
      disconnect: ws.disconnect,

      // Scene data
      sceneData: ws.sceneData,
      windFieldData: ws.windFieldData,
      isDataLoaded: !!(ws.sceneData && ws.windFieldData),

      // Data fetching
      fetchSceneData,

      // Simulation
      simulation: ws.simulation,
      paths: ws.simulation.paths,
      currentFrame: ws.simulation.currentFrame,
      metrics: ws.simulation.metrics,

      // Simulation control
      startSimulation: ws.startSimulation,

      // Playback control
      playback: ws.playback,
      setPlaybackPaused: ws.setPlaybackPaused,
      setPlaybackSpeed: ws.setPlaybackSpeed,

      // Helpers
      sceneBounds,
    }),
    [ws, fetchSceneData, sceneBounds]
  );

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useScene(): SceneContextValue {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error('useScene must be used within a SceneProvider');
  }
  return context;
}

// ============================================================================
// Exports
// ============================================================================

export default SceneContext;
