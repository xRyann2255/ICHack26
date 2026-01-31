# Wind-Aware Drone Routing

## Project Overview

A hackathon project for **Hudson River Trading: Best Use of Data for Predictions & Decision-Making**.

We use CFD wind simulation data around buildings to compute optimized drone delivery routes that account for wind conditions, turbulence, and safety factors.

**Core Thesis:** Data (CFD wind field) → Prediction (risk/cost modeling) → Decision (optimal route selection)

---

## Demo Structure

**Phase 1: Pathfinding Visualization** - Side-by-side 2D top-down view showing naive vs wind-aware route computation.

**Phase 2: 3D Flight Simulation** - Side-by-side 3D view of drones flying both routes in the same wind conditions.

---

## Backend Summary

The backend is fully implemented. Key components:

- **Route Algorithm**: Dijkstra on 3D grid with direction-dependent edge costs (distance + headwind + turbulence)
- **Drone Simulator**: Physics-based flight simulation with wind drift/corrections
- **WebSocket Server**: Real-time streaming of drone positions to frontend

**Start server:** `python -m backend.server.websocket_server --port 8765 --frame-delay 0.05`

**Weight configs:** Speed (`w1=0.3, w2=0.6, w3=0.1`), Safety (`w1=0.2, w2=0.2, w3=0.6`), Balanced (`w1=0.33, w2=0.33, w3=0.34`)

---

## Frontend Data Reference

This section documents the data formats the frontend receives from the backend WebSocket server.

### Starting the Server

```bash
python -m backend.server.websocket_server --port 8765 --frame-delay 0.05
```

Connect to: `ws://localhost:8765`

---

### WebSocket Message Protocol

#### 1. Get Scene Info

**Request:**
```json
{"type": "get_scene"}
```

**Response:**
```json
{
  "type": "scene",
  "data": {
    "bounds": {
      "min": [0, 0, 0],
      "max": [200, 200, 80]
    },
    "grid_resolution": 10.0,
    "wind_base_direction": [8.0, 2.0, 0.0],
    "buildings": [
      {
        "id": "building_0",
        "min": [45.2, 30.1, 0],
        "max": [85.6, 70.3, 65.0]
      }
    ],
    "wind_field_shape": [41, 41, 17]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bounds.min` | [x, y, z] | Scene minimum corner (meters) |
| `bounds.max` | [x, y, z] | Scene maximum corner (meters) |
| `grid_resolution` | float | Pathfinding grid cell size (meters) |
| `wind_base_direction` | [vx, vy, vz] | Base wind velocity (m/s) |
| `buildings` | array | Building bounding boxes |
| `buildings[].id` | string | Building identifier |
| `buildings[].min` | [x, y, z] | Building minimum corner |
| `buildings[].max` | [x, y, z] | Building maximum corner |
| `wind_field_shape` | [nx, ny, nz] | Wind field grid dimensions |

---

#### 2. Get Wind Field

**Request:**
```json
{"type": "get_wind_field", "downsample": 2}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `downsample` | int | 1 | Sample every Nth point (2 = half resolution, reduces data 8x) |

**Response:**
```json
{
  "type": "wind_field",
  "data": {
    "bounds": {
      "min": [0, 0, 0],
      "max": [200, 200, 80]
    },
    "resolution": 10.0,
    "shape": [21, 21, 9],
    "downsample": 2,
    "wind_vectors": [
      [8.1, 2.3, 0.1],
      [7.9, 2.1, 0.0],
      ...
    ],
    "turbulence": [0.05, 0.08, 0.12, ...]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `resolution` | float | Distance between grid points (meters) |
| `shape` | [nx, ny, nz] | Grid dimensions |
| `wind_vectors` | [[vx,vy,vz], ...] | Flattened array of wind velocities (m/s) |
| `turbulence` | [float, ...] | Flattened array of turbulence intensity (0-1) |

**Array Layout:** C-order (row-major) - x varies fastest, then y, then z

**Converting flat index to world position:**
```javascript
function indexToPosition(index, shape, bounds, resolution) {
  const [nx, ny, nz] = shape;
  const iz = Math.floor(index / (nx * ny));
  const iy = Math.floor((index % (nx * ny)) / nx);
  const ix = index % nx;

  return {
    x: bounds.min[0] + ix * resolution,
    y: bounds.min[1] + iy * resolution,
    z: bounds.min[2] + iz * resolution
  };
}

// Example: Get wind at index 500
const pos = indexToPosition(500, data.shape, data.bounds, data.resolution);
const wind = data.wind_vectors[500];  // [vx, vy, vz]
const turb = data.turbulence[500];    // 0-1
```

---

#### 3. Get Everything (Scene + Wind Field)

**Request:**
```json
{"type": "get_all", "downsample": 2}
```

**Response:**
```json
{
  "type": "full_scene",
  "data": {
    "bounds": { "min": [...], "max": [...] },
    "grid_resolution": 10.0,
    "wind_base_direction": [8.0, 2.0, 0.0],
    "buildings": [...],
    "wind_field_shape": [41, 41, 17],
    "wind_field": {
      "bounds": {...},
      "resolution": 10.0,
      "shape": [21, 21, 9],
      "wind_vectors": [...],
      "turbulence": [...]
    }
  }
}
```

---

#### 4. Start Simulation

**Request:**
```json
{
  "type": "start",
  "start": [180, 100, 40],
  "end": [20, 100, 40],
  "route_type": "both"
}
```

| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `start` | [x, y, z] | - | Start position (meters) |
| `end` | [x, y, z] | - | End position (meters) |
| `route_type` | string | `"naive"`, `"optimized"`, `"both"` | Which routes to simulate |

---

#### 5. Paths Response

Sent immediately after `start` request:

```json
{
  "type": "paths",
  "data": {
    "naive": [
      [180, 100, 40],
      [175, 100, 40],
      [170, 100, 40],
      ...
      [20, 100, 40]
    ],
    "optimized": [
      [180, 100, 40],
      [175, 105, 42],
      [168, 112, 45],
      ...
      [20, 100, 40]
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `naive` | [[x,y,z], ...] | Smoothed waypoints for naive (distance-only) route |
| `optimized` | [[x,y,z], ...] | Smoothed waypoints for wind-aware route |

---

#### 6. Simulation Start (per route)

```json
{
  "type": "simulation_start",
  "route": "naive",
  "waypoint_count": 45
}
```

---

#### 7. Frame (streamed in real-time)

Sent continuously during simulation at ~20 FPS (configurable via `--frame-delay`):

```json
{
  "type": "frame",
  "route": "naive",
  "data": {
    "time": 1.5,
    "position": [175.2, 102.3, 40.0],
    "velocity": [12.5, 0.3, 0.0],
    "heading": [0.95, -0.31, 0.0],
    "wind": [5.0, 2.0, 0.0],
    "drift": [0.5, 1.8, 0.0],
    "correction": [-0.05, -0.18, 0.0],
    "effort": 0.45,
    "airspeed": 15.0,
    "groundspeed": 12.8,
    "waypoint_index": 3,
    "distance_to_waypoint": 12.5
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `route` | string | `"naive"` or `"optimized"` |
| `time` | float | Simulation time (seconds) |
| `position` | [x, y, z] | Drone world position (meters) |
| `velocity` | [vx, vy, vz] | Ground velocity vector (m/s) |
| `heading` | [hx, hy, hz] | Unit vector - direction drone nose is pointing |
| `wind` | [wx, wy, wz] | Wind velocity at drone position (m/s) |
| `drift` | [dx, dy, dz] | Crosswind component pushing drone off course |
| `correction` | [cx, cy, cz] | Heading correction drone is applying |
| `effort` | float | 0-1, how hard drone is working (for visualization) |
| `airspeed` | float | Speed through air (m/s) |
| `groundspeed` | float | Speed over ground (m/s) |
| `waypoint_index` | int | Current target waypoint index |
| `distance_to_waypoint` | float | Distance to next waypoint (meters) |

**Visualization Notes:**
- `heading` may differ from `velocity` direction - this is "crabbing" (angling into wind)
- `effort` increases with headwind and course corrections
- `drift` shows crosswind effect
- `correction` shows how much the drone is compensating

---

#### 8. Simulation End (per route)

```json
{
  "type": "simulation_end",
  "route": "naive",
  "flight_summary": {
    "total_time": 45.2,
    "total_distance": 450.0,
    "average_groundspeed": 9.96,
    "average_effort": 0.35,
    "max_effort": 0.82,
    "completed": true,
    "waypoints_reached": 45,
    "frame_count": 452
  },
  "metrics": {
    "total_distance": 450.0,
    "total_flight_time": 45.2,
    "average_ground_speed": 9.96,
    "energy_consumption": 1.85,
    "average_power": 147.3,
    "crash_probability": 0.12,
    "max_turbulence_encountered": 0.45,
    "max_wind_speed_encountered": 12.3,
    "turbulence_zones_crossed": 2,
    "headwind_segments": 28,
    "tailwind_segments": 17
  }
}
```

**Flight Summary Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `total_time` | float | Flight duration (seconds) |
| `total_distance` | float | Distance traveled (meters) |
| `average_groundspeed` | float | Average speed over ground (m/s) |
| `average_effort` | float | Average effort level (0-1) |
| `max_effort` | float | Peak effort level (0-1) |
| `completed` | bool | Whether drone reached destination |
| `waypoints_reached` | int | Number of waypoints passed |
| `frame_count` | int | Total frames in simulation |

**Metrics Fields:**
| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `total_distance` | float | meters | Path length |
| `total_flight_time` | float | seconds | Time to complete |
| `average_ground_speed` | float | m/s | Average ground speed |
| `energy_consumption` | float | Wh | Battery energy used |
| `average_power` | float | Watts | Average power draw |
| `crash_probability` | float | % | Estimated crash risk (0-100) |
| `max_turbulence_encountered` | float | 0-1 | Peak turbulence on route |
| `max_wind_speed_encountered` | float | m/s | Peak wind speed on route |
| `turbulence_zones_crossed` | int | count | High-turbulence areas passed through |
| `headwind_segments` | int | count | Path segments with headwind |
| `tailwind_segments` | int | count | Path segments with tailwind |

---

#### 9. Complete

Sent when all simulations finish:

```json
{
  "type": "complete",
  "metrics": {
    "naive": {
      "total_distance": 450.0,
      "total_flight_time": 45.2,
      "energy_consumption": 1.85,
      "crash_probability": 0.12,
      ...
    },
    "optimized": {
      "total_distance": 485.0,
      "total_flight_time": 38.5,
      "energy_consumption": 1.42,
      "crash_probability": 0.03,
      ...
    }
  }
}
```

---

#### 10. Utility Messages

**Ping/Pong:**
```json
{"type": "ping"}     // Client sends
{"type": "pong"}     // Server responds
```

**Error:**
```json
{
  "type": "error",
  "message": "Missing start or end position"
}
```

---

### Coordinate System

- **Origin**: `bounds.min` (typically [0, 0, 0])
- **X-axis**: Increases eastward (primary wind direction)
- **Y-axis**: Increases northward
- **Z-axis**: Increases upward (altitude)
- **Units**: Meters for position, m/s for velocity

---

### Frontend Implementation Checklist

1. **Connect to WebSocket** at `ws://localhost:8765`

2. **Fetch initial data:**
   ```javascript
   ws.send(JSON.stringify({type: "get_all", downsample: 2}));
   ```

3. **Render buildings** as 3D boxes from `data.buildings[]`

4. **Render wind field** from `data.wind_field`:
   - Convert each index to position using `indexToPosition()`
   - Draw arrows/streamlines showing wind direction and magnitude
   - Optionally color by turbulence

5. **Start simulation:**
   ```javascript
   ws.send(JSON.stringify({
     type: "start",
     start: [180, 100, 40],
     end: [20, 100, 40],
     route_type: "both"
   }));
   ```

6. **Handle `paths` message:**
   - Draw naive path (e.g., red line)
   - Draw optimized path (e.g., green line)

7. **Handle `frame` messages:**
   - Update drone position
   - Rotate drone model to match `heading` (shows crabbing into wind)
   - Visualize `effort` (color intensity, particles, trail effects)
   - Optionally show `wind` vector at drone position

8. **Handle `simulation_end` / `complete`:**
   - Display metrics comparison panel
   - Highlight improvements (time saved, energy saved, risk reduction)

---

## Frontend Implementation Plan

### Tech Stack

```
React + TypeScript + Vite
Three.js via @react-three/fiber + @react-three/drei
```

### Dependencies

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

### Implementation Order

Build incrementally - each step should be testable before moving to the next.

---

#### Step 1: Project Setup

**Goal:** Basic Vite + React + TypeScript project with Three.js rendering a test cube.

**Tasks:**
- [x] Create Vite project: `npm create vite@latest frontend -- --template react-ts`
- [x] Install dependencies: `three`, `@react-three/fiber`, `@react-three/drei`
- [x] Create basic `<Canvas>` with a rotating cube
- [x] Add `OrbitControls` from drei
- [x] Verify hot reload works

**Test:** See a rotating cube you can orbit around.

**Files:**
```
frontend/
├── src/
│   ├── App.tsx           # Main app with Canvas
│   ├── components/
│   │   └── Scene.tsx     # 3D scene content
│   └── main.tsx
```

---

#### Step 2: WebSocket Hook

**Goal:** Connect to backend, receive and store scene data.

**Tasks:**
- [x] Create `useWebSocket` hook with connection management
- [x] Handle message types: `scene`, `wind_field`, `full_scene`
- [x] Create TypeScript interfaces for all data types
- [x] Store scene data in React state/context
- [x] Add connection status indicator

**Test:** Console logs show scene data received from backend.

**Files:**
```
src/
├── hooks/
│   └── useWebSocket.ts   # WebSocket connection hook
├── types/
│   └── api.ts            # TypeScript interfaces for API messages
└── context/
    └── SceneContext.tsx  # Store scene data
```

**Key Interfaces:**
```typescript
interface SceneData {
  bounds: { min: number[]; max: number[] };
  buildings: Building[];
  windFieldShape: number[];
}

interface WindFieldData {
  resolution: number;
  shape: number[];
  windVectors: number[][];
  turbulence: number[];
}

interface FrameData {
  time: number;
  position: number[];
  heading: number[];
  velocity: number[];
  effort: number;
  // ... etc
}
```

---

#### Step 3: STL Terrain Loading (South Kensington)

**Goal:** Load and render the `southken.stl` file as the terrain/building geometry for the demo area.

**STL File:** `southken.stl` (South Kensington area)

**Tasks:**
- [x] Copy `southken.stl` to `frontend/ichack26/public/models/`
- [x] Install drei (already done) - has `useLoader` support
- [x] Create `Terrain.tsx` component using STLLoader
- [x] Center and scale the mesh appropriately
- [x] Apply material (building color, optional edges)
- [x] Compute bounding box for camera positioning
- [x] Add loading state/suspense fallback

**Test:** See the South Kensington buildings/terrain rendered in 3D.

**Files:**
```
public/
└── models/
    └── southken.stl          # STL terrain file

src/components/
└── Terrain.tsx               # STL loading component
```

**Code Pattern:**
```tsx
import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import * as THREE from 'three'
import { useMemo } from 'react'

function Terrain() {
  // Load the STL geometry
  const geometry = useLoader(STLLoader, '/models/southken.stl')

  // Center the geometry and compute bounds
  const { centeredGeometry, bounds } = useMemo(() => {
    const geo = geometry.clone()
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)

    // Center the geometry at origin
    geo.translate(-center.x, -center.y, -box.min.z) // Keep Z at ground level

    return {
      centeredGeometry: geo,
      bounds: {
        min: [box.min.x - center.x, box.min.y - center.y, 0],
        max: [box.max.x - center.x, box.max.y - center.y, box.max.z - box.min.z]
      }
    }
  }, [geometry])

  return (
    <mesh geometry={centeredGeometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#667788"
        flatShading
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// Wrap with Suspense in parent component
export default Terrain
```

**Usage in Scene:**
```tsx
import { Suspense } from 'react'
import Terrain from './Terrain'

function Scene() {
  return (
    <>
      <Suspense fallback={<LoadingBox />}>
        <Terrain />
      </Suspense>
      {/* ... other components */}
    </>
  )
}

function LoadingBox() {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshBasicMaterial color="gray" wireframe />
    </mesh>
  )
}
```

**Coordinate System Notes:**
- STL files may use different units (mm vs m) - may need scaling
- STL may have different up-axis (Z-up vs Y-up) - may need rotation
- Compute bounding box to determine scene bounds for wind field alignment

**Scaling if needed:**
```tsx
// If STL is in millimeters, scale to meters
<mesh scale={[0.001, 0.001, 0.001]} geometry={centeredGeometry}>
```

**Rotation if STL uses different up-axis:**
```tsx
// If STL has Y-up but scene needs Z-up
<mesh rotation={[-Math.PI / 2, 0, 0]} geometry={centeredGeometry}>
```

**TypeScript Types:**
```typescript
// Add to vite-env.d.ts if STLLoader types aren't recognized
declare module 'three/examples/jsm/loaders/STLLoader' {
  import { BufferGeometry, Loader, LoadingManager } from 'three'
  export class STLLoader extends Loader {
    constructor(manager?: LoadingManager)
    load(
      url: string,
      onLoad: (geometry: BufferGeometry) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void
    parse(data: ArrayBuffer | string): BufferGeometry
  }
}
```

---

#### Step 4: Wind Field Visualization

**Goal:** Render wind vectors as arrows or lines showing wind direction/strength.

**Tasks:**
- [x] Create `WindField` component
- [x] Convert flat array indices to 3D positions
- [x] Render arrows using instanced meshes (for performance)
- [x] Color by wind speed or turbulence
- [x] Add toggle to show/hide wind field
- [x] Downsample for performance (show every Nth arrow)

**Test:** See arrows throughout scene pointing in wind direction.

**Files:**
```
src/components/
├── WindField.tsx         # Wind visualization
└── WindArrow.tsx         # Single arrow geometry (or use instances)
```

**Performance Tip:** Use `InstancedMesh` for thousands of arrows:
```tsx
function WindArrows({ windData }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = windData.windVectors.length;

  useEffect(() => {
    // Set position/rotation for each instance
    windData.windVectors.forEach((wind, i) => {
      const pos = indexToPosition(i, windData.shape, ...);
      const matrix = new THREE.Matrix4();
      matrix.setPosition(pos.x, pos.y, pos.z);
      matrix.lookAt(/* wind direction */);
      meshRef.current.setMatrixAt(i, matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [windData]);

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <coneGeometry args={[0.5, 2, 8]} />
      <meshStandardMaterial color="cyan" />
    </instancedMesh>
  );
}
```

---

#### Step 5: Path Rendering

**Goal:** Display naive and optimized paths as colored lines.

**Tasks:**
- [x] Create `FlightPath` component using drei's `<Line>`
- [x] Render naive path (red/orange)
- [x] Render optimized path (green/blue)
- [x] Add path visibility toggles
- [ ] Optional: animate path drawing

**Test:** See two different colored paths through the scene.

**Files:**
```
src/components/
└── FlightPath.tsx        # Path line rendering
```

**Code Pattern:**
```tsx
import { Line } from '@react-three/drei';

function FlightPath({ path, color }: { path: number[][], color: string }) {
  const points = path.map(p => new THREE.Vector3(...p));
  return (
    <Line points={points} color={color} lineWidth={3} />
  );
}
```

---

#### Step 6: Drone Model & Animation

**Goal:** Animated drone that follows the path based on frame data.

**Tasks:**
- [x] Create `Drone` component (simple geometry or load GLTF model)
- [x] Position drone from frame `position`
- [x] Rotate drone to match frame `heading`
- [x] Visualize `effort` (color, glow, particle trail)
- [x] Smooth interpolation between frames
- [x] Add propeller spin animation

**Test:** Drone moves along path, rotates to show crabbing.

**Files:**
```
src/components/
├── Drone.tsx             # Drone mesh/model
└── DroneTrail.tsx        # Optional: trail effect
```

**Code Pattern:**
```tsx
function Drone({ frame }: { frame: FrameData | null }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!frame || !meshRef.current) return;

    // Position
    meshRef.current.position.set(...frame.position);

    // Rotation from heading
    const dir = new THREE.Vector3(...frame.heading);
    meshRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0), // Drone's forward axis
      dir.normalize()
    );
  });

  // Color based on effort
  const color = frame ? lerpColor('green', 'red', frame.effort) : 'gray';

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 0.5, 2]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
```

---

#### Step 7: Simulation State Machine

**Goal:** Manage simulation lifecycle (idle → loading → paths → simulating → complete).

**Tasks:**
- [x] Create simulation state machine / reducer (integrated in useWebSocket hook)
- [x] Handle all WebSocket message types
- [x] Store frames for both routes
- [ ] Track current playback time
- [ ] Support play/pause/restart

**Test:** Can start simulation, receive frames, see state transitions.

**Files:**
```
src/
├── hooks/
│   └── useSimulation.ts  # Simulation state management
└── types/
    └── simulation.ts     # State types
```

**State Shape:**
```typescript
type SimulationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; paths: { naive: Path; optimized: Path } }
  | { status: 'simulating'; currentFrame: { naive: Frame; optimized: Frame } }
  | { status: 'complete'; metrics: Metrics };
```

---

#### Step 8: Two-Phase Visualization (Route Creation → Drone Flight)

**Goal:** A cinematic two-phase demo that first shows the routes being computed, then shows the drones flying them.

---

##### Phase 1: Route Creation Visualization

**Description:** Camera pans along as each route is being created, showing the pathfinding algorithm exploring the space and building the path in real-time.

**Tasks:**
- [ ] Create `RouteCreationView` component with single `<Canvas>`
- [ ] Animate path drawing - show waypoints appearing one by one
- [ ] Camera follows the path as it's being created (smooth pan/dolly)
- [ ] Show exploration nodes briefly (Dijkstra visited nodes fading in/out)
- [ ] Side-by-side or sequential: show naive route creation, then optimized
- [ ] Visual difference: naive path appears as straight segments, optimized curves around obstacles
- [ ] Transition effect when route creation completes (camera pulls back to overview)

**Camera Behavior:**
```tsx
// Camera follows the path creation
function useRouteCreationCamera(pathProgress: number, path: Vector3[]) {
  const cameraRef = useRef<THREE.PerspectiveCamera>();

  useFrame(() => {
    if (!cameraRef.current || path.length === 0) return;

    // Get current point along path based on progress (0-1)
    const currentIndex = Math.floor(pathProgress * (path.length - 1));
    const currentPoint = path[currentIndex];
    const nextPoint = path[Math.min(currentIndex + 1, path.length - 1)];

    // Position camera above and behind current point
    const offset = new THREE.Vector3(0, 30, -50); // Above and behind
    const direction = nextPoint.clone().sub(currentPoint).normalize();
    const cameraPos = currentPoint.clone().add(offset);

    // Smooth camera movement
    cameraRef.current.position.lerp(cameraPos, 0.05);
    cameraRef.current.lookAt(currentPoint);
  });

  return cameraRef;
}
```

**Path Animation:**
```tsx
function AnimatedPath({ path, progress }: { path: Vector3[], progress: number }) {
  // Only show path up to current progress
  const visiblePoints = Math.floor(progress * path.length);
  const visiblePath = path.slice(0, visiblePoints);

  return (
    <>
      {/* Drawn path */}
      <Line points={visiblePath} color="cyan" lineWidth={3} />

      {/* Current exploration point (glowing) */}
      {visiblePoints > 0 && (
        <mesh position={path[visiblePoints - 1]}>
          <sphereGeometry args={[2, 16, 16]} />
          <meshBasicMaterial color="yellow" />
        </mesh>
      )}
    </>
  );
}
```

---

##### Phase 2: Third-Person Drone Flight

**Description:** After routes are shown, switch to side-by-side view with third-person cameras following each drone as they fly their respective routes.

**Tasks:**
- [ ] Create `DroneFlightView` component with two `<Canvas>` panels
- [ ] Third-person camera follows behind each drone
- [ ] Camera smoothly tracks drone position and heading
- [ ] Show drone model rotating/crabbing into wind
- [ ] Display real-time metrics (speed, effort) per panel
- [ ] Wind streamlines visible in both panels
- [ ] Sync playback so both drones start simultaneously

**Third-Person Camera:**
```tsx
function ThirdPersonCamera({ dronePosition, droneHeading }: Props) {
  const cameraRef = useRef<THREE.PerspectiveCamera>();

  useFrame(() => {
    if (!cameraRef.current) return;

    // Camera offset: behind and above the drone
    const offset = new THREE.Vector3(-20, 10, 0); // Behind, above

    // Rotate offset by drone heading
    const heading = new THREE.Vector3(...droneHeading);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      heading.normalize()
    );
    offset.applyQuaternion(quaternion);

    // Position camera
    const targetPos = new THREE.Vector3(...dronePosition).add(offset);
    cameraRef.current.position.lerp(targetPos, 0.1);

    // Look at drone (slightly ahead)
    const lookTarget = new THREE.Vector3(...dronePosition)
      .add(heading.multiplyScalar(10));
    cameraRef.current.lookAt(lookTarget);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault />;
}
```

**Side-by-Side Layout:**
```tsx
function DroneFlightView() {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      <div style={{ flex: 1, borderRight: '2px solid #333', position: 'relative' }}>
        <div className="panel-label">Naive Route</div>
        <Canvas>
          <ThirdPersonCamera
            dronePosition={naiveFrame.position}
            droneHeading={naiveFrame.heading}
          />
          <SimulationScene route="naive" />
        </Canvas>
        <MetricsOverlay frame={naiveFrame} />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div className="panel-label">Wind-Optimized Route</div>
        <Canvas>
          <ThirdPersonCamera
            dronePosition={optimizedFrame.position}
            droneHeading={optimizedFrame.heading}
          />
          <SimulationScene route="optimized" />
        </Canvas>
        <MetricsOverlay frame={optimizedFrame} />
      </div>
    </div>
  );
}
```

---

##### Phase Transition

**Tasks:**
- [ ] Create `DemoOrchestrator` component to manage phase transitions
- [ ] Phase 1 → Phase 2 transition with smooth camera animation
- [ ] Optional: brief pause with "Routes Computed" overlay before Phase 2
- [ ] State machine: `idle → route_creation → transition → drone_flight → complete`

**Orchestrator Pattern:**
```tsx
type DemoPhase = 'idle' | 'route_creation' | 'transition' | 'drone_flight' | 'complete';

function DemoOrchestrator() {
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [routeProgress, setRouteProgress] = useState(0);

  // Phase 1: Route creation animation
  useEffect(() => {
    if (phase === 'route_creation') {
      const interval = setInterval(() => {
        setRouteProgress(p => {
          if (p >= 1) {
            setPhase('transition');
            return 1;
          }
          return p + 0.01; // Adjust speed
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [phase]);

  // Transition to Phase 2
  useEffect(() => {
    if (phase === 'transition') {
      setTimeout(() => setPhase('drone_flight'), 2000); // 2s pause
    }
  }, [phase]);

  return (
    <>
      {phase === 'route_creation' && (
        <RouteCreationView progress={routeProgress} />
      )}
      {phase === 'transition' && (
        <TransitionOverlay message="Routes Computed - Starting Flight Simulation" />
      )}
      {phase === 'drone_flight' && (
        <DroneFlightView />
      )}
      {phase === 'complete' && (
        <MetricsComparison />
      )}
    </>
  );
}
```

---

**Files:**
```
src/
├── App.tsx                     # DemoOrchestrator integration
├── components/
│   ├── DemoOrchestrator.tsx    # Phase state machine
│   ├── RouteCreationView.tsx   # Phase 1: animated route drawing
│   ├── AnimatedPath.tsx        # Path that draws itself
│   ├── DroneFlightView.tsx     # Phase 2: side-by-side drone flight
│   ├── ThirdPersonCamera.tsx   # Camera that follows drone
│   ├── TransitionOverlay.tsx   # "Routes Computed" overlay
│   └── MetricsOverlay.tsx      # Real-time metrics per panel
```

**Test:**
1. Phase 1: See camera pan as routes are drawn, showing pathfinding exploration
2. Transition: Brief pause with overlay message
3. Phase 2: Two side-by-side panels with third-person cameras following drones

---

#### Step 9: UI Controls

**Goal:** Control panel to set start/end points and trigger simulation.

**Tasks:**
- [ ] Create control panel UI (outside Canvas)
- [ ] Input fields or preset buttons for start/end positions
- [ ] "Start Simulation" button
- [ ] Playback controls (play/pause/speed)
- [ ] Toggles for wind field visibility, path visibility
- [x] Connection status indicator (ConnectionStatus.tsx)

**Test:** Can click button to start simulation with chosen endpoints.

**Files:**
```
src/components/
├── ControlPanel.tsx      # Main control UI
├── PlaybackControls.tsx  # Play/pause/speed
└── VisibilityToggles.tsx # Show/hide elements
```

---

#### Step 10: Metrics Display

**Goal:** Show comparison metrics when simulation completes.

**Tasks:**
- [ ] Create metrics panel component
- [ ] Display key metrics: time, energy, crash risk
- [ ] Show improvement percentages
- [ ] Highlight which route is better for each metric
- [ ] Optional: animated counters

**Test:** After simulation, see metrics comparison panel.

**Files:**
```
src/components/
├── MetricsPanel.tsx      # Metrics comparison display
└── MetricCard.tsx        # Single metric with comparison
```

**Display Pattern:**
```tsx
function MetricsPanel({ naive, optimized }: MetricsProps) {
  const timeSaved = naive.total_flight_time - optimized.total_flight_time;
  const energySaved = naive.energy_consumption - optimized.energy_consumption;

  return (
    <div className="metrics-panel">
      <MetricCard
        label="Flight Time"
        naive={`${naive.total_flight_time.toFixed(1)}s`}
        optimized={`${optimized.total_flight_time.toFixed(1)}s`}
        improvement={`${timeSaved.toFixed(1)}s faster`}
      />
      <MetricCard
        label="Energy"
        naive={`${naive.energy_consumption.toFixed(2)} Wh`}
        optimized={`${optimized.energy_consumption.toFixed(2)} Wh`}
        improvement={`${((energySaved/naive.energy_consumption)*100).toFixed(0)}% less`}
      />
      {/* ... more metrics */}
    </div>
  );
}
```

---

#### Step 11: Polish & Effects

**Goal:** Visual polish for demo impact.

**Tasks:**
- [x] Add skybox or gradient background (background color + fog added in App.tsx)
- [ ] Post-processing effects (bloom for effort glow)
- [ ] Drone trail/particle effects
- [ ] Smooth camera transitions
- [x] Loading states and animations (Suspense fallback in Scene.tsx)
- [ ] Responsive layout
- [ ] Sound effects (optional)

**Files:**
```
src/components/
├── Effects.tsx           # Post-processing
├── Environment.tsx       # Skybox, fog
└── ParticleTrail.tsx     # Drone trail effect
```

**Post-processing with drei:**
```tsx
import { EffectComposer, Bloom } from '@react-three/postprocessing';

function Effects() {
  return (
    <EffectComposer>
      <Bloom intensity={0.5} luminanceThreshold={0.8} />
    </EffectComposer>
  );
}
```

---

### Verification Checklist

After each step, verify:

- [ ] No console errors
- [ ] Component renders correctly
- [ ] Data flows from WebSocket to component
- [ ] Performance is acceptable (60 FPS target)
- [ ] Works with backend running

---

### File Structure (Final)

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Scene.tsx
│   │   ├── Buildings.tsx
│   │   ├── Ground.tsx
│   │   ├── Lighting.tsx
│   │   ├── WindField.tsx
│   │   ├── FlightPath.tsx
│   │   ├── Drone.tsx
│   │   ├── DroneTrail.tsx
│   │   ├── SimulationPanel.tsx
│   │   ├── SplitView.tsx
│   │   ├── ControlPanel.tsx
│   │   ├── MetricsPanel.tsx
│   │   ├── Effects.tsx
│   │   └── Environment.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useSimulation.ts
│   ├── context/
│   │   └── SceneContext.tsx
│   ├── types/
│   │   ├── api.ts
│   │   └── simulation.ts
│   └── utils/
│       ├── windField.ts      # Index conversion helpers
│       └── colors.ts         # Color interpolation
├── public/
│   └── models/
│       └── drone.glb         # Optional drone model
└── package.json
```
