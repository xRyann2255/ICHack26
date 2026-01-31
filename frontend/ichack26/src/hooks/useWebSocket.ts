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
  FullSceneData,
  PathsData,
  FrameData,
  RouteMetrics,
  FlightSummary,
} from '../types/api';

// ============================================================================
// Types
// ============================================================================

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
}

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: ServerMessage) => void;
  onError?: (error: string) => void;
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

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

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
            console.log('[WS] Wind field received:', message.data.shape);
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
            // Update current frame for the appropriate route
            setSimulation((prev) => ({
              ...prev,
              currentFrame: {
                ...prev.currentFrame,
                [message.route]: message.data,
              },
            }));
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

      send({
        type: 'start',
        start,
        end,
        route_type: routeType,
      });
    },
    [send]
  );

  const ping = useCallback(() => {
    send({ type: 'ping' });
  }, [send]);

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
