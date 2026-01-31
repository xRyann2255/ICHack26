# Wind-Aware Drone Routing

## Project Overview

A hackathon project for **Hudson River Trading: Best Use of Data for Predictions & Decision-Making**.

We use CFD (Computational Fluid Dynamics) wind simulation data around buildings to compute optimized drone delivery routes that account for wind conditions, turbulence, and safety factors.

**Core Thesis:** Data (CFD wind field) → Prediction (risk/cost modeling) → Decision (optimal route selection)

---

## Demo Structure

The demo consists of two sequential phases:

### Phase 1: Pathfinding Visualization (Top-Down)

A side-by-side 2D top-down view showing the pathfinding algorithm in action.

| Left Panel | Right Panel |
|------------|-------------|
| Naive route (straight line or simple A*, ignores wind in planning) | Wind-aware route (optimizes path based on CFD wind data) |

This phase illustrates HOW the algorithm explores the space and arrives at different routes. Both routes operate in the SAME wind conditions - the difference is whether the route planning considers the wind.

### Phase 2: 3D Flight Simulation (Side-by-Side)

A side-by-side 3D visualization showing the drone flying each route in the SAME wind conditions.

| Left Panel | Right Panel |
|------------|-------------|
| Naive route with CFD wind streamlines | Optimized route with CFD wind streamlines |
| Drone flies the straight-line/simple path | Drone flies the wind-optimized path |
| Shows drone struggling against headwinds | Shows drone utilizing favorable wind corridors |

Both panels display the same wind field visualization. This phase shows the RESULT - how the naive drone fights against the wind while the optimized drone works with it.

---

## Route Algorithm

### Approach: Pre-computed Dijkstra with 3D Grid

We use Dijkstra's algorithm on a 3D grid where each node corresponds to a position with CFD wind data. The key insight is that edge costs are **direction-dependent** due to wind effects.

### Graph Structure
- **Nodes**: 3D grid points aligned with CFD data grid
- **Edges**: 26-connectivity (all adjacent nodes including diagonals)
- **Edge Costs**: Pre-computed based on wind interaction with travel direction

### Edge Cost Calculation

```python
def calculate_edge_cost(node_a, node_b, wind_field, turbulence_field):
    # Get travel direction and distance
    travel_vector = normalize(node_b.pos - node_a.pos)
    distance = norm(node_b.pos - node_a.pos)

    # Average wind between nodes
    wind_at_edge = (wind_field[node_a] + wind_field[node_b]) / 2

    # Calculate headwind component (negative = headwind, positive = tailwind)
    wind_alignment = dot(wind_at_edge, travel_vector)
    headwind_resistance = max(0, -wind_alignment)

    # Average turbulence
    turbulence = (turbulence_field[node_a] + turbulence_field[node_b]) / 2

    # Total cost with tunable weights
    cost = (w1 * distance +
            w2 * headwind_resistance * distance +
            w3 * turbulence * distance)

    return cost
```

### Weight Configurations
- **Speed Priority**: `w1=0.3, w2=0.6, w3=0.1` (minimize headwind impact)
- **Safety Priority**: `w1=0.2, w2=0.2, w3=0.6` (avoid turbulence)
- **Balanced**: `w1=0.33, w2=0.33, w3=0.34` (equal consideration)

### Metrics to Compute

For each route (naive and optimized), compute and display:

#### 1. **Total Distance**
```python
total_distance = sum(norm(path[i+1] - path[i]) for i in range(len(path)-1))
```

#### 2. **Total Flight Time**
Account for wind effects on ground speed:
```python
def calculate_flight_time(path, wind_field, base_speed=15.0):  # m/s
    total_time = 0
    for i in range(len(path)-1):
        segment = path[i+1] - path[i]
        direction = normalize(segment)
        distance = norm(segment)

        # Wind effect on ground speed
        wind = wind_field[path[i]]
        wind_assist = dot(wind, direction)  # positive = tailwind
        ground_speed = base_speed + wind_assist

        # Ensure minimum speed (drone can't go backwards)
        ground_speed = max(1.0, ground_speed)

        segment_time = distance / ground_speed
        total_time += segment_time

    return total_time
```

#### 3. **Energy Consumption**
Based on power required to overcome drag and maintain speed:
```python
def calculate_energy_consumption(path, wind_field, turbulence_field):
    energy = 0
    base_power = 100  # Watts for hovering

    for i in range(len(path)-1):
        segment = path[i+1] - path[i]
        direction = normalize(segment)
        distance = norm(segment)

        # Power to overcome headwind
        wind = wind_field[path[i]]
        headwind = max(0, -dot(wind, direction))
        wind_power = headwind * 15  # Additional watts per m/s headwind

        # Power for turbulence compensation
        turbulence = turbulence_field[path[i]]
        turbulence_power = turbulence * 50  # Additional watts for stabilization

        # Total power for segment
        segment_power = base_power + wind_power + turbulence_power
        segment_time = distance / ground_speed  # From time calculation

        energy += segment_power * segment_time  # Watt-seconds

    return energy / 3600  # Convert to Watt-hours
```

#### 4. **Crash/Instability Probability**
Based on cumulative turbulence exposure and peak turbulence events:
```python
def calculate_crash_probability(path, turbulence_field, wind_field):
    # Parameters (tune based on drone specs)
    MAX_SAFE_TURBULENCE = 0.3  # Normalized scale
    MAX_SAFE_WIND_SPEED = 20.0  # m/s

    crash_risk = 0.0

    for point in path:
        turbulence = turbulence_field[point]
        wind_speed = norm(wind_field[point])

        # Turbulence risk (exponential increase above threshold)
        if turbulence > MAX_SAFE_TURBULENCE:
            turb_risk = 1 - exp(-5 * (turbulence - MAX_SAFE_TURBULENCE))
        else:
            turb_risk = 0

        # Wind speed risk
        if wind_speed > MAX_SAFE_WIND_SPEED:
            wind_risk = 1 - exp(-0.5 * (wind_speed - MAX_SAFE_WIND_SPEED))
        else:
            wind_risk = 0

        # Combine risks (assuming independence)
        point_risk = 1 - (1 - turb_risk) * (1 - wind_risk)

        # Accumulate risk (probability of surviving all points)
        crash_risk = 1 - (1 - crash_risk) * (1 - point_risk * 0.001)

    return crash_risk * 100  # Return as percentage
```

#### 5. **High-Turbulence Zones Crossed**
```python
def count_turbulence_zones(path, turbulence_field, threshold=0.5):
    count = 0
    in_zone = False

    for point in path:
        if turbulence_field[point] > threshold:
            if not in_zone:
                count += 1
                in_zone = True
        else:
            in_zone = False

    return count
```

These metrics should be displayed comparatively to highlight the benefits of wind-aware routing.

---

## Drone Flight Simulator

### Purpose

The pathfinding algorithm outputs a series of waypoints, but the frontend 3D visualization needs to show the drone **actually flying** through the wind field. This includes:

- Drone being pushed off course by wind
- Drone making corrections to stay on the path
- Visual difference between naive drone (struggling) and optimized drone (working with wind)

### Physics Model

The simulator models a drone flying through wind:

```python
@dataclass
class DroneState:
    position: Vector3      # Current world position
    velocity: Vector3      # Current velocity (ground-relative)
    heading: Vector3       # Direction drone is pointing (may differ from velocity due to crabbing)
    target_waypoint: int   # Index of current target waypoint

@dataclass
class FlightFrame:
    time: float            # Simulation time (seconds)
    position: Vector3      # World position
    velocity: Vector3      # Ground velocity
    heading: Vector3       # Drone heading (nose direction)
    wind: Vector3          # Wind at this position
    drift: Vector3         # How much wind is pushing drone off course
    correction: Vector3    # Correction vector drone is applying
    effort: float          # 0-1 indicating how hard drone is working (for visualization)
    airspeed: float        # Speed relative to air
    groundspeed: float     # Speed relative to ground
```

### Flight Dynamics

```python
def simulate_step(state, wind_field, waypoints, dt=0.1):
    # 1. Get wind at current position
    wind = wind_field.get_wind_at(state.position)

    # 2. Calculate desired direction to next waypoint
    target = waypoints[state.target_waypoint]
    desired_dir = normalize(target - state.position)

    # 3. Calculate required heading to compensate for wind ("crabbing")
    # To achieve desired ground velocity, we need: airspeed_vec + wind = ground_velocity
    # So: heading = desired_dir * airspeed - wind (simplified)

    # 4. Apply drone's max airspeed
    airspeed = DRONE_MAX_AIRSPEED  # e.g., 15 m/s
    air_velocity = heading * airspeed

    # 5. Calculate actual ground velocity
    ground_velocity = air_velocity + wind

    # 6. Calculate effort (how much correction is needed)
    # effort = |correction_angle| / max_correction_angle

    # 7. Update position
    new_position = state.position + ground_velocity * dt

    # 8. Check if waypoint reached, advance to next
```

### Output Format

The simulator outputs a time series for the frontend:

```json
{
  "flight_data": {
    "drone_params": {
      "max_airspeed": 15.0,
      "max_correction_rate": 45.0
    },
    "frames": [
      {
        "time": 0.0,
        "position": [10, 10, 30],
        "velocity": [12.5, 0.3, 0],
        "heading": [0.95, -0.31, 0],
        "wind": [5.0, 2.0, 0],
        "effort": 0.25,
        "groundspeed": 12.5,
        "airspeed": 15.0,
        "waypoint_index": 0
      },
      {
        "time": 0.1,
        "position": [11.25, 10.03, 30],
        ...
      }
    ],
    "total_time": 45.2,
    "total_distance": 450.0,
    "average_effort": 0.35,
    "max_effort": 0.82
  }
}
```

### Visualization Use

The frontend uses this data to:

1. **Animate drone position** - Smooth interpolation between frames
2. **Rotate drone model** - Point in heading direction (shows crabbing)
3. **Show effort indicator** - Color/particles showing how hard drone is working
4. **Compare routes** - Side-by-side naive vs optimized, same wind conditions

---

## WebSocket Server

### Starting the Server

```bash
python -m backend.server.websocket_server --port 8765 --frame-delay 0.05
```

### Protocol

**1. Client connects to `ws://localhost:8765`**

**2. Client requests scene info:**
```json
{"type": "get_scene"}
```

**3. Server responds with scene:**
```json
{
  "type": "scene",
  "data": {
    "bounds": {"min": [0,0,0], "max": [200,200,80]},
    "buildings": [{"id": "...", "min": [...], "max": [...]}]
  }
}
```

**4. Client requests wind field (for streamlines):**
```json
{"type": "get_wind_field", "downsample": 2}
```

**5. Server sends wind field:**
```json
{
  "type": "wind_field",
  "data": {
    "bounds": {"min": [0,0,0], "max": [200,200,80]},
    "resolution": 10.0,
    "shape": [21, 21, 9],
    "wind_vectors": [[vx,vy,vz], ...],
    "turbulence": [0.05, 0.12, ...]
  }
}
```

**6. Client starts simulation:**
```json
{
  "type": "start",
  "start": [180, 100, 40],
  "end": [20, 100, 40],
  "route_type": "both"
}
```

**5. Server sends paths:**
```json
{
  "type": "paths",
  "data": {
    "naive": [[x,y,z], ...],
    "optimized": [[x,y,z], ...]
  }
}
```

**6. Server streams frames in real-time:**
```json
{
  "type": "frame",
  "route": "naive",
  "data": {
    "time": 1.5,
    "position": [175.2, 102.3, 40.0],
    "velocity": [12.5, 0.3, 0],
    "heading": [0.95, -0.31, 0],
    "wind": [5.0, 2.0, 0],
    "effort": 0.45,
    "groundspeed": 12.8,
    "airspeed": 15.0
  }
}
```

**7. Server sends completion:**
```json
{
  "type": "complete",
  "metrics": {...}
}
```

### Frame Data (per frame)

| Field | Type | Description |
|-------|------|-------------|
| `time` | float | Simulation time (seconds) |
| `position` | [x,y,z] | World position |
| `velocity` | [x,y,z] | Ground velocity |
| `heading` | [x,y,z] | Drone nose direction |
| `wind` | [x,y,z] | Wind at position |
| `effort` | 0-1 | How hard drone is working |
| `groundspeed` | float | Speed over ground (m/s) |
| `airspeed` | float | Speed through air (m/s) |

### Wind Field Data

The wind field can be requested for rendering streamlines:

| Message | Response Size | Use Case |
|---------|--------------|----------|
| `{"type": "get_wind_field"}` | ~1.5 MB | Full resolution |
| `{"type": "get_wind_field", "downsample": 2}` | ~220 KB | For visualization |
| `{"type": "get_all", "downsample": 2}` | ~222 KB | Scene + wind combined |

**Wind field format:**
- `shape`: [nx, ny, nz] grid dimensions
- `resolution`: meters between samples
- `wind_vectors`: flattened array of [vx, vy, vz] per cell
- `turbulence`: flattened array of turbulence values (0-1)
- Array order: x varies fastest, then y, then z (C-order/row-major)

**Converting flat index to 3D position:**
```javascript
// Frontend: convert cell index to world position
function cellToPosition(index, shape, bounds, resolution) {
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
```

---

## Implementation Details

### Pre-computation Strategy

Since we avoid real-time computation, we pre-compute everything before the demo:

```python
class WindAwareRouter:
    def __init__(self, wind_field, turbulence_field, grid_resolution=5.0):
        # Create 3D grid aligned with CFD data
        self.grid = create_3d_grid(grid_resolution)

        # Pre-compute ALL edge costs (one-time expensive operation)
        self.edge_costs = {}
        for node in self.grid.nodes:
            for neighbor in node.get_26_neighbors():
                if not is_collision(node, neighbor, buildings):
                    cost = calculate_edge_cost(node, neighbor,
                                              wind_field, turbulence_field)
                    self.edge_costs[(node.id, neighbor.id)] = cost

    def compute_route(self, start, end):
        # Run Dijkstra with pre-computed costs
        path = dijkstra(start, end, self.edge_costs)

        # Smooth path with spline interpolation
        smooth_path = smooth_path_spline(path, num_points=100)

        # Store exploration history for visualization
        return {
            'path': smooth_path,
            'raw_path': path,
            'exploration_history': self.exploration_frames
        }
```

### Demo Data Preparation

```python
# Run this before the hackathon demo
def prepare_demo_data():
    # Load CFD data from teammates
    wind_field, turbulence_field = load_cfd_data()

    # Define start/end points for demo
    scenarios = [
        {'start': [10, 10, 30], 'end': [490, 490, 50]},
        # Add more scenarios as needed
    ]

    results = {}
    for scenario in scenarios:
        # Compute wind-aware route
        router = WindAwareRouter(wind_field, turbulence_field)
        optimal = router.compute_route(scenario['start'], scenario['end'])

        # Compute naive route (straight line with collision avoidance)
        naive = compute_naive_route(scenario['start'], scenario['end'])

        # Calculate all metrics
        metrics = {
            'optimal': calculate_all_metrics(optimal['path'], wind_field, turbulence_field),
            'naive': calculate_all_metrics(naive['path'], wind_field, turbulence_field)
        }

        results[scenario_id] = {
            'optimal_route': optimal,
            'naive_route': naive,
            'metrics': metrics
        }

    # Save everything to JSON for demo
    save_demo_data(results)
```

## Data Requirements

### From CFD Team (Teammates)

1. **Wind velocity field**
   - 3D grid of wind vectors: `V(x, y, z) → (vx, vy, vz)`
   - Coverage: entire scene volume
   - Resolution: TBD (balance between accuracy and performance)

2. **Turbulence intensity field**
   - 3D grid of scalar turbulence values
   - Same grid as velocity field
   - Values normalized or with defined scale

3. **Building geometry**
   - Positions and dimensions of all buildings in scene
   - Format: bounding boxes or mesh geometry

4. **Scene bounds**
   - Coordinate system definition
   - Min/max for x, y, z axes

### Data Format

To be agreed upon with teammates. Suggested: NumPy `.
` for wind data, JSON or OBJ for geometry.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | TypeScript, React |
| 3D Rendering | TBD |
| Backend | Python |
| API | TBD |
| Data Format | TBD |

---

## User Interaction

TBD — Options include:
- Click to set start/end points
- Preset delivery scenarios
- Adjustable wind conditions
- Risk tolerance slider

---

## Open Questions

1. What city/scene are we modeling?
2. What scale (meters, blocks)?
3. How many wind scenarios (fixed or switchable)?
4. Should pathfinding visualization be animated or instant?
5. What drone speed assumptions?
6. How to visualize streamlines effectively?
7. What visual style (realistic vs stylized)?

---

## Team Responsibilities

| Area | Owner |
|------|-------|
| CFD simulation & wind data | Teammates |
| Decision engine (pathfinding) | Ryan |
| Frontend UI & visualization | Ryan |
| Data format integration | Shared |

---

## Success Criteria

A compelling demo that clearly shows:
1. The pathfinding algorithm making different decisions based on wind data
2. Visual difference between naive and optimized routes
3. Quantitative metrics proving the optimized route is superior
4. The "wow factor" of seeing wind streamlines and understanding why the route matters

---

## Development Guidelines

### Incremental Implementation

When implementing features, **build incrementally** with discrete, testable steps:

1. **One task at a time** - Complete and verify each component before moving to the next
2. **Test after each step** - Run the code to confirm it works before continuing
3. **Small commits** - Each task should result in working, committable code
4. **Dependencies first** - Build foundational components before those that depend on them

### Implementation Order

Follow this sequence for the routing algorithm:

1. [x] **Step 1: Core data structures** - `Vector3`, `GridNode` classes
2. [x] **Step 2: Grid creation** - `Grid3D` with node generation and neighbor lookup
3. [x] **Step 3: Building geometry** - `Building` class with collision detection
4. [x] **Step 4: Mock data generator** - Generate test wind/building data
5. [x] **Step 5: Wind field** - `WindField` class with interpolation
6. [x] **Step 6: Cost calculator** - Edge cost computation with wind awareness
7. [x] **Step 7: Dijkstra router** - Pathfinding with exploration history
8. [x] **Step 8: Naive router** - A* comparison baseline
9. [x] **Step 9: Path smoother** - Spline interpolation
10. [x] **Step 10: Metrics calculator** - All 5 metrics from spec
11. [x] **Step 11: Serializer** - JSON output for frontend
12. [x] **Step 12: Main entry point** - CLI integration
13. [x] **Step 13: Drone flight simulator** - Simulate actual flight with wind drift/corrections
14. [x] **Step 14: WebSocket server** - Live streaming of drone positions to frontend

### Verification at Each Step

After completing each step:
- Run unit tests or manual verification
- Confirm the component integrates with previous work
- Document any deviations from the plan

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