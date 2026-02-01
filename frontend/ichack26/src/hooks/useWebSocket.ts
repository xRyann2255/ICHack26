/**
 * WebSocket hook for connecting to the drone simulation backend.
 *
 * Manages connection lifecycle, message handling, and reconnection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConnectionStatus,
  ServerMessage,
  ClientMessage,
  SceneData,
  WindFieldData,
  PathsData,
  FrameData,
  RouteMetrics,
  FlightSummary,
} from '../types/api';

// ============================================================================
// Types
// ============================================================================

export interface SpeedSample {
  time: number;
  groundspeed: number;
  airspeed: number;
}

export interface SimulationState {
  status: 'idle' | 'loading' | 'paths_received' | 'simulating' | 'complete';
  paths: PathsData | null;
  currentFrame: {
    naive: FrameData | null;
    optimized: FrameData | null;
  };
  metrics: {
    naive: RouteMetrics | null;
    optimized: RouteMetrics | null;
  };
  flightSummary: {
    naive: FlightSummary | null;
    optimized: FlightSummary | null;
  };
  speedHistory: {
    naive: SpeedSample[];
    optimized: SpeedSample[];
  };
}

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: ServerMessage) => void;
  onError?: (error: string) => void;
}

export interface PlaybackControl {
  isPaused: boolean;
  speed: number;
}

export interface UseWebSocketReturn {
  // Connection state
  status: ConnectionStatus;
  error: string | null;

  // Scene data
  sceneData: SceneData | null;
  windFieldData: WindFieldData | null;

  // Simulation state
  simulation: SimulationState;

  // Playback control
  playback: PlaybackControl;
  setPlaybackPaused: (paused: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;

  // Actions
  connect: () => void;
  disconnect: () => void;
  send: (message: ClientMessage) => void;
  requestScene: () => void;
  requestWindField: (downsample?: number) => void;
  requestAll: (downsample?: number) => void;
  startSimulation: (
    start: [number, number, number],
    end: [number, number, number],
    routeType?: 'naive' | 'optimized' | 'both'
  ) => void;
  ping: () => void;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_URL = 'ws://localhost:8765';
const DEFAULT_RECONNECT_INTERVAL = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

const INITIAL_SIMULATION_STATE: SimulationState = {
  status: 'idle',
  paths: null,
  currentFrame: { naive: null, optimized: null },
  metrics: { naive: null, optimized: null },
  flightSummary: { naive: null, optimized: null },
  speedHistory: { naive: [], optimized: [] },
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = DEFAULT_URL,
    autoConnect = true,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    onMessage,
    onError,
  } = options;

  // Connection state
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  // Scene data
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [windFieldData, setWindFieldData] = useState<WindFieldData | null>(null);

  // Simulation state
  const [simulation, setSimulation] = useState<SimulationState>(INITIAL_SIMULATION_STATE);

  // Playback control state
  const [playback, setPlayback] = useState<PlaybackControl>({ isPaused: false, speed: 1 });

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const playbackRef = useRef(playback); // Keep ref in sync for use in callbacks

  // Keep playback ref in sync
  playbackRef.current = playback;

  // ============================================================================
  // Message Handler
  // ============================================================================

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);

        // Call custom handler if provided
        onMessage?.(message);

        switch (message.type) {
          case 'scene':
            console.log('[WS] Scene data received:', message.data);
            setSceneData(message.data);
            break;

          case 'wind_field':
            console.log('[WS] Wind field received:', message.data.points?.length || 0, 'points');
            setWindFieldData(message.data);
            break;

          case 'full_scene':
            console.log('[WS] Full scene received');
            setSceneData(message.data);
            setWindFieldData(message.data.wind_field);
            break;

          case 'paths':
            console.log('[WS] Paths received:', {
              naive: message.data.naive?.length,
              optimized: message.data.optimized?.length,
            });
            setSimulation((prev) => ({
              ...prev,
              status: 'paths_received',
              paths: message.data,
            }));
            break;

          case 'simulation_start':
            console.log('[WS] Simulation started:', message.route);
            setSimulation((prev) => ({
              ...prev,
              status: 'simulating',
            }));
            break;

          case 'frame':
            // Skip frame updates if paused
            if (playbackRef.current.isPaused) {
              break;
            }

            // Debug: log every 20th frame to see what's coming in
            if (Math.floor(message.data.time * 10) % 20 === 0) {
              console.log(`[WS] Frame ${message.route}: t=${message.data.time.toFixed(2)}, pos=(${message.data.position[0].toFixed(1)},${message.data.position[1].toFixed(1)},${message.data.position[2].toFixed(1)})`);
            }

            // Update current frame and collect speed sample
            setSimulation((prev) => {
              const route = message.route as 'naive' | 'optimized';
              const newSample: SpeedSample = {
                time: message.data.time,
                groundspeed: message.data.groundspeed,
                airspeed: message.data.airspeed,
              };

              return {
                ...prev,
                currentFrame: {
                  ...prev.currentFrame,
                  [route]: message.data,
                },
                speedHistory: {
                  ...prev.speedHistory,
                  [route]: [...prev.speedHistory[route], newSample],
                },
              };
            });
            break;

          case 'simulation_end':
            console.log('[WS] Simulation ended:', message.route, message.metrics);
            setSimulation((prev) => ({
              ...prev,
              metrics: {
                ...prev.metrics,
                [message.route]: message.metrics,
              },
              flightSummary: {
                ...prev.flightSummary,
                [message.route]: message.flight_summary,
              },
            }));
            break;

          case 'complete':
            console.log('[WS] All simulations complete:', message.metrics);
            setSimulation((prev) => ({
              ...prev,
              status: 'complete',
              metrics: {
                naive: message.metrics.naive || prev.metrics.naive,
                optimized: message.metrics.optimized || prev.metrics.optimized,
              },
            }));
            break;

          case 'pong':
            console.log('[WS] Pong received');
            break;

          case 'error':
            console.error('[WS] Server error:', message.message);
            setError(message.message);
            onError?.(message.message);
            break;

          default:
            console.warn('[WS] Unknown message type:', message);
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    },
    [onMessage, onError]
  );

  // ============================================================================
  // Connection Management
  // ============================================================================

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('connecting');
    setError(null);

    console.log('[WS] Connecting to', url);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setStatus('connected');
      setError(null);
      reconnectAttempts.current = 0;
    };

    ws.onclose = (event) => {
      console.log('[WS] Disconnected:', event.code, event.reason);
      setStatus('disconnected');
      wsRef.current = null;

      // Auto-reconnect if not intentionally closed
      if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        console.log(
          `[WS] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`
        );
        reconnectTimeoutRef.current = window.setTimeout(connect, reconnectInterval);
      }
    };

    ws.onerror = (event) => {
      console.error('[WS] Error:', event);
      setStatus('error');
      setError('WebSocket connection error');
    };

    ws.onmessage = handleMessage;

    wsRef.current = ws;
  }, [url, reconnectInterval, maxReconnectAttempts, handleMessage]);

  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    setStatus('disconnected');
  }, []);

  // ============================================================================
  // Send Messages
  // ============================================================================

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected');
    }
  }, []);

  const requestScene = useCallback(() => {
    send({ type: 'get_scene' });
  }, [send]);

  const requestWindField = useCallback(
    (downsample?: number) => {
      send({ type: 'get_wind_field', downsample });
    },
    [send]
  );

  const requestAll = useCallback(
    (downsample?: number) => {
      send({ type: 'get_all', downsample });
    },
    [send]
  );

  const startSimulation = useCallback(
    (
      start: [number, number, number],
      end: [number, number, number],
      routeType: 'naive' | 'optimized' | 'both' = 'both'
    ) => {
      // Reset simulation state
      setSimulation({
        ...INITIAL_SIMULATION_STATE,
        status: 'loading',
      });

      // Request scene data first if not already loaded
      if (!sceneData || !windFieldData) {
        console.log('[WS] Fetching scene data before starting simulation...');
        send({ type: 'get_all', downsample: 2 });
      }

      send({
        type: 'start',
        start,
        end,
        route_type: routeType,
      });
    },
    [send, sceneData, windFieldData]
  );

  const ping = useCallback(() => {
    send({ type: 'ping' });
  }, [send]);

  // Playback control functions
  const setPlaybackPaused = useCallback((paused: boolean) => {
    setPlayback((prev) => ({ ...prev, isPaused: paused }));
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlayback((prev) => ({ ...prev, speed }));
  }, []);

  // ============================================================================
  // Effects
  // ============================================================================

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    status,
    error,
    sceneData,
    windFieldData,
    simulation,
    playback,
    setPlaybackPaused,
    setPlaybackSpeed,
    connect,
    disconnect,
    send,
    requestScene,
    requestWindField,
    requestAll,
    startSimulation,
    ping,
  };
}

export default useWebSocket;
