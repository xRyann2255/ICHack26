/**
 * Scene Context - Global state for scene data and WebSocket connection.
 *
 * Provides scene data, wind field, and simulation state to all components.
 */

import { createContext, useContext, type ReactNode, useMemo, useCallback, useState } from 'react';
import { useWebSocket, type SimulationState, type PlaybackControl, type SpeedSample } from '../hooks/useWebSocket';
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

export type RoutePlanningMode = 'idle' | 'selecting_start' | 'selecting_end' | 'ready' | 'calculating';

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

  // Route planning
  routePlanningMode: RoutePlanningMode;
  selectedStart: [number, number, number] | null;
  selectedEnd: [number, number, number] | null;
  enterPlanningMode: () => void;
  exitPlanningMode: () => void;
  setSelectedStart: (pos: [number, number, number]) => void;
  setSelectedEnd: (pos: [number, number, number]) => void;
  confirmRoute: () => void;

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
  speedHistory: {
    naive: SpeedSample[];
    optimized: SpeedSample[];
  };

  // Simulation control
  startSimulation: (
    start: [number, number, number],
    end: [number, number, number],
    routeType?: 'naive' | 'optimized' | 'both'
  ) => void;
  resetSimulation: () => void;

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

  // Route planning state
  const [routePlanningMode, setRoutePlanningMode] = useState<RoutePlanningMode>('idle');
  const [selectedStart, setSelectedStartState] = useState<[number, number, number] | null>(null);
  const [selectedEnd, setSelectedEndState] = useState<[number, number, number] | null>(null);

  // Fetch scene and wind field data
  const fetchSceneData = useCallback(
    (downsample = 2) => {
      console.log('[SceneContext] Fetching scene data...');
      ws.requestAll(downsample);
    },
    [ws]
  );

  // Route planning functions
  const enterPlanningMode = useCallback(() => {
    // Reset simulation state from previous run
    ws.resetSimulation();
    setRoutePlanningMode('selecting_start');
    setSelectedStartState(null);
    setSelectedEndState(null);
  }, [ws]);

  const exitPlanningMode = useCallback(() => {
    setRoutePlanningMode('idle');
    setSelectedStartState(null);
    setSelectedEndState(null);
  }, []);

  const setSelectedStart = useCallback((pos: [number, number, number]) => {
    setSelectedStartState(pos);
    setRoutePlanningMode('selecting_end');
  }, []);

  const setSelectedEnd = useCallback((pos: [number, number, number]) => {
    setSelectedEndState(pos);
    setRoutePlanningMode('ready');
  }, []);

  const confirmRoute = useCallback(() => {
    if (selectedStart && selectedEnd) {
      setRoutePlanningMode('calculating');
      ws.startSimulation(selectedStart, selectedEnd, 'both');
    }
  }, [selectedStart, selectedEnd, ws]);

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

      // Route planning
      routePlanningMode,
      selectedStart,
      selectedEnd,
      enterPlanningMode,
      exitPlanningMode,
      setSelectedStart,
      setSelectedEnd,
      confirmRoute,

      // Simulation
      simulation: ws.simulation,
      paths: ws.simulation.paths,
      currentFrame: ws.simulation.currentFrame,
      metrics: ws.simulation.metrics,
      speedHistory: ws.simulation.speedHistory,

      // Simulation control
      startSimulation: ws.startSimulation,
      resetSimulation: ws.resetSimulation,

      // Playback control
      playback: ws.playback,
      setPlaybackPaused: ws.setPlaybackPaused,
      setPlaybackSpeed: ws.setPlaybackSpeed,

      // Helpers
      sceneBounds,
    }),
    [ws, fetchSceneData, sceneBounds, routePlanningMode, selectedStart, selectedEnd, enterPlanningMode, exitPlanningMode, setSelectedStart, setSelectedEnd, confirmRoute]
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
