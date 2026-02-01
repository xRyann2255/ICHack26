/**
 * TypeScript interfaces for WebSocket API messages.
 *
 * These types match the backend WebSocket server protocol
 * documented in CLAUDE.md.
 */

// ============================================================================
// Scene Data
// ============================================================================

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface Building {
  id: string;
  min: [number, number, number];
  max: [number, number, number];
}

export interface SceneData {
  bounds: Bounds;
  grid_resolution: number;
  wind_base_direction: [number, number, number];
  buildings: Building[];
  wind_field_shape: [number, number, number];
}

// ============================================================================
// Wind Field Data
// ============================================================================

export interface WindFieldData {
  bounds: Bounds;
  points: [number, number, number][];
  velocity: [number, number, number][];
  ke: number[];
}

export interface FullSceneData extends SceneData {
  wind_field: WindFieldData;
}

// ============================================================================
// Simulation Data
// ============================================================================

export interface PathsData {
  naive?: [number, number, number][];
  optimized?: [number, number, number][];
}

export interface FrameData {
  time: number;
  position: [number, number, number];
  velocity: [number, number, number];
  heading: [number, number, number];
  wind: [number, number, number];
  drift: [number, number, number];
  correction: [number, number, number];
  effort: number;
  airspeed: number;
  groundspeed: number;
  waypoint_index: number;
  distance_to_waypoint: number;
}

export interface FlightSummary {
  total_time: number;
  total_distance: number;
  average_groundspeed: number;
  average_effort: number;
  max_effort: number;
  completed: boolean;
  waypoints_reached: number;
  frame_count: number;
}

export interface RouteMetrics {
  total_distance: number;
  total_flight_time: number;
  average_ground_speed: number;
  energy_consumption: number;
  average_power: number;
  crash_probability: number;
  max_turbulence_encountered: number;
  max_wind_speed_encountered: number;
  turbulence_zones_crossed: number;
  headwind_segments: number;
  tailwind_segments: number;
}

// ============================================================================
// WebSocket Messages - Server to Client
// ============================================================================

export interface SceneMessage {
  type: 'scene';
  data: SceneData;
}

export interface WindFieldMessage {
  type: 'wind_field';
  data: WindFieldData;
}

export interface FullSceneMessage {
  type: 'full_scene';
  data: FullSceneData;
}

export interface PathsMessage {
  type: 'paths';
  data: PathsData;
}

export interface SimulationStartMessage {
  type: 'simulation_start';
  route: 'naive' | 'optimized';
  waypoint_count: number;
}

export interface FrameMessage {
  type: 'frame';
  route: 'naive' | 'optimized';
  data: FrameData;
}

export interface SimulationEndMessage {
  type: 'simulation_end';
  route: 'naive' | 'optimized';
  flight_summary: FlightSummary;
  metrics: RouteMetrics;
}

export interface CompleteMessage {
  type: 'complete';
  metrics: {
    naive?: RouteMetrics;
    optimized?: RouteMetrics;
  };
}

export interface PongMessage {
  type: 'pong';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | SceneMessage
  | WindFieldMessage
  | FullSceneMessage
  | PathsMessage
  | SimulationStartMessage
  | FrameMessage
  | SimulationEndMessage
  | CompleteMessage
  | PongMessage
  | ErrorMessage;

// ============================================================================
// WebSocket Messages - Client to Server
// ============================================================================

export interface GetSceneRequest {
  type: 'get_scene';
}

export interface GetWindFieldRequest {
  type: 'get_wind_field';
  downsample?: number;
}

export interface GetAllRequest {
  type: 'get_all';
  downsample?: number;
}

export interface StartSimulationRequest {
  type: 'start';
  start: [number, number, number];
  end: [number, number, number];
  route_type: 'naive' | 'optimized' | 'both';
}

export interface PingRequest {
  type: 'ping';
}

export type ClientMessage =
  | GetSceneRequest
  | GetWindFieldRequest
  | GetAllRequest
  | StartSimulationRequest
  | PingRequest;

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert flat wind field index to 3D world position.
 */
export function indexToPosition(
  index: number,
  shape: [number, number, number],
  bounds: Bounds,
  resolution: number
): { x: number; y: number; z: number } {
  const [nx, ny] = shape;
  const iz = Math.floor(index / (nx * ny));
  const iy = Math.floor((index % (nx * ny)) / nx);
  const ix = index % nx;

  return {
    x: bounds.min[0] + ix * resolution,
    y: bounds.min[1] + iy * resolution,
    z: bounds.min[2] + iz * resolution,
  };
}

/**
 * Get the center position of a building.
 */
export function getBuildingCenter(building: Building): [number, number, number] {
  return [
    (building.min[0] + building.max[0]) / 2,
    (building.min[1] + building.max[1]) / 2,
    (building.min[2] + building.max[2]) / 2,
  ];
}

/**
 * Get the size of a building.
 */
export function getBuildingSize(building: Building): [number, number, number] {
  return [
    building.max[0] - building.min[0],
    building.max[1] - building.min[1],
    building.max[2] - building.min[2],
  ];
}
