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

// Frame subscription for high-frequency updates without React re-renders
export type FrameSubscriber = (frames: { naive: FrameData | null; optimized: FrameData | null }) => void;

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

  // Frame subscription (for high-frequency updates without React re-renders)
  subscribeToFrames: (callback: FrameSubscriber) => () => void;
  getCurrentFrames: () => { naive: FrameData | null; optimized: FrameData | null };

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
  resetSimulation: () => void;
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
  const periodicReconnectRef = useRef<number | null>(null);
  const playbackRef = useRef(playback); // Keep ref in sync for use in callbacks
  const statusRef = useRef(status); // Keep status ref in sync for interval callback
  const connectRef = useRef<() => void>(() => {}); // Ref for connect function

  // High-frequency frame data stored in refs to avoid React re-renders
  const currentFramesRef = useRef<{ naive: FrameData | null; optimized: FrameData | null }>({ naive: null, optimized: null });
  const frameSubscribersRef = useRef<Set<FrameSubscriber>>(new Set());
  const frameCountRef = useRef<{ naive: number; optimized: number }>({ naive: 0, optimized: 0 });
  const speedHistoryRef = useRef<{ naive: SpeedSample[]; optimized: SpeedSample[] }>({ naive: [], optimized: [] });

  // Keep refs in sync
  playbackRef.current = playback;
  statusRef.current = status;

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
            console.log('[WS] Buildings:', message.data.buildings?.length, 'buildings');
            if (message.data.buildings?.length > 0) {
              console.log('[WS] First building:', message.data.buildings[0]);
            }
            setSceneData(message.data);
            break;

          case 'wind_field':
            console.log('[WS] Wind field received:', message.data.points?.length || 0, 'points');
            setWindFieldData(message.data);
            break;

          case 'full_scene':
            console.log('[WS] Full scene received');
            console.log('[WS] Buildings:', message.data.buildings?.length, 'buildings');
            if (message.data.buildings?.length > 0) {
              console.log('[WS] First building:', message.data.buildings[0]);
            }
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

          case 'frame': {
            // Skip frame updates if paused
            if (playbackRef.current.isPaused) {
              break;
            }

            const route = message.route as 'naive' | 'optimized';

            // Debug: log every 100th frame to reduce console noise
            frameCountRef.current[route]++;
            if (frameCountRef.current[route] % 100 === 0) {
              console.log(`[WS] Frame ${message.route}: t=${message.data.time.toFixed(2)}, pos=(${message.data.position[0].toFixed(1)},${message.data.position[1].toFixed(1)},${message.data.position[2].toFixed(1)})`);
            }

            // Update frame data in ref (no React re-render)
            currentFramesRef.current = {
              ...currentFramesRef.current,
              [route]: message.data,
            };

            // Notify subscribers (Three.js components can update directly)
            frameSubscribersRef.current.forEach(subscriber => {
              subscriber(currentFramesRef.current);
            });

            // Sample speed history every 5th frame to reduce memory pressure
            // Also cap at 500 samples max to prevent unbounded growth
            if (frameCountRef.current[route] % 5 === 0) {
              const newSample: SpeedSample = {
                time: message.data.time,
                groundspeed: message.data.groundspeed,
                airspeed: message.data.airspeed,
              };
              speedHistoryRef.current[route].push(newSample);
              // Keep only last 500 samples
              if (speedHistoryRef.current[route].length > 500) {
                speedHistoryRef.current[route] = speedHistoryRef.current[route].slice(-500);
              }
            }

            // Update React state only every 10th frame for UI that needs it
            if (frameCountRef.current[route] % 10 === 0) {
              setSimulation((prev) => ({
                ...prev,
                currentFrame: currentFramesRef.current,
                speedHistory: {
                  naive: [...speedHistoryRef.current.naive],
                  optimized: [...speedHistoryRef.current.optimized],
                },
              }));
            }
            break;
          }

          case 'simulation_end':
            console.log('[WS] Simulation ended:', message.route, message.metrics);
            // Sync final frame data to React state
            setSimulation((prev) => ({
              ...prev,
              currentFrame: currentFramesRef.current,
              speedHistory: {
                naive: [...speedHistoryRef.current.naive],
                optimized: [...speedHistoryRef.current.optimized],
              },
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
    // Skip if already connected or connecting
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('[WS] Already connected or connecting, skipping');
      return;
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
      // Only update state if this is still the current connection
      if (wsRef.current === ws) {
        setStatus('disconnected');
        wsRef.current = null;

        // Auto-reconnect if not intentionally closed
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(
            `[WS] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`
          );
          reconnectTimeoutRef.current = window.setTimeout(() => connectRef.current(), reconnectInterval);
        }
      }
    };

    ws.onerror = (event) => {
      console.error('[WS] Error:', event);
      if (wsRef.current === ws) {
        setStatus('error');
        setError('WebSocket connection error');
      }
    };

    ws.onmessage = handleMessage;

    wsRef.current = ws;
  }, [url, reconnectInterval, maxReconnectAttempts, handleMessage]);

  // Keep connect ref in sync
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear periodic reconnect interval
    if (periodicReconnectRef.current) {
      clearInterval(periodicReconnectRef.current);
      periodicReconnectRef.current = null;
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
      console.log('[WS] Sending:', message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected. Message:', message);
      console.warn('[WS] WebSocket state:', wsRef.current?.readyState);
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
      // Reset refs for new simulation
      currentFramesRef.current = { naive: null, optimized: null };
      frameCountRef.current = { naive: 0, optimized: 0 };
      speedHistoryRef.current = { naive: [], optimized: [] };

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

  // Reset simulation state (for starting a new route)
  const resetSimulation = useCallback(() => {
    setSimulation(INITIAL_SIMULATION_STATE);
    // Also reset refs
    currentFramesRef.current = { naive: null, optimized: null };
    frameCountRef.current = { naive: 0, optimized: 0 };
    speedHistoryRef.current = { naive: [], optimized: [] };
  }, []);

  // Frame subscription functions
  const subscribeToFrames = useCallback((callback: FrameSubscriber) => {
    frameSubscribersRef.current.add(callback);
    // Return unsubscribe function
    return () => {
      frameSubscribersRef.current.delete(callback);
    };
  }, []);

  const getCurrentFrames = useCallback(() => {
    return currentFramesRef.current;
  }, []);

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

  // Auto-connect on mount (only run once)
  useEffect(() => {
    if (autoConnect) {
      connectRef.current();
    }

    return () => {
      // Clean up on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (periodicReconnectRef.current) {
        clearInterval(periodicReconnectRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  // Periodic reconnection check - keeps trying if disconnected
  useEffect(() => {
    if (!autoConnect) return;

    // Clear any existing interval first
    if (periodicReconnectRef.current) {
      clearInterval(periodicReconnectRef.current);
    }

    periodicReconnectRef.current = window.setInterval(() => {
      // Use refs to get current values (avoids stale closures)
      const currentStatus = statusRef.current;
      const wsState = wsRef.current?.readyState;

      // Only attempt reconnect if not connected
      if (wsState !== WebSocket.OPEN && wsState !== WebSocket.CONNECTING) {
        console.log('[WS] Periodic reconnect - status:', currentStatus, 'wsState:', wsState);
        reconnectAttempts.current = 0; // Reset attempts for periodic retry
        connectRef.current();
      }
    }, reconnectInterval);

    return () => {
      if (periodicReconnectRef.current) {
        clearInterval(periodicReconnectRef.current);
        periodicReconnectRef.current = null;
      }
    };
  }, [autoConnect, reconnectInterval]);

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
    subscribeToFrames,
    getCurrentFrames,
    connect,
    disconnect,
    send,
    requestScene,
    requestWindField,
    requestAll,
    startSimulation,
    resetSimulation,
    ping,
  };
}

export default useWebSocket;

// ============================================================================
// useFrameData Hook - For efficient frame access in Three.js components
// ============================================================================

/**
 * Hook for accessing frame data efficiently in Three.js components.
 * Uses a ref pattern that works well with useFrame from @react-three/fiber.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { subscribeToFrames, getCurrentFrames } = useScene();
 *   const frameRef = useFrameRef(subscribeToFrames, getCurrentFrames);
 *
 *   useFrame(() => {
 *     const frame = frameRef.current.naive; // or .optimized
 *     // Update Three.js objects directly
 *   });
 * }
 * ```
 */
export function useFrameRef(
  subscribe: (callback: FrameSubscriber) => () => void,
  getSnapshot: () => { naive: FrameData | null; optimized: FrameData | null }
) {
  const frameRef = useRef(getSnapshot());

  useEffect(() => {
    // Update ref whenever frames change
    const unsubscribe = subscribe((frames) => {
      frameRef.current = frames;
    });
    return unsubscribe;
  }, [subscribe]);

  return frameRef;
}
