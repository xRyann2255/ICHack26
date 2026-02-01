# Wind-Aware Drone Routing

## Project Overview

A hackathon project for **Hudson River Trading: Best Use of Data for Predictions & Decision-Making**.

We use CFD wind simulation data around buildings to compute optimized drone delivery routes that account for wind conditions, turbulence, and safety factors.

**Core Thesis:** Data (CFD wind field) → Prediction (risk/cost modeling) → Decision (optimal route selection)

## Demo Structure

**Phase 1: Pathfinding Visualization** - Side-by-side 2D top-down view showing naive vs wind-aware route computation.

**Phase 2: 3D Flight Simulation** - Side-by-side 3D view of drones flying both routes in the same wind conditions.

## Running the Project

### Backend

```bash
python -m backend.server.websocket_server --port 8765 --frame-delay 0.05 --vtu internal.vtu
```

**Server options:**
- `--port`: WebSocket port (default: 8765)
- `--frame-delay`: Delay between simulation frames in seconds (default: 0.05)
- `--vtu`: Path to VTU file with CFD wind data (default: internal.vtu)
- `--stl`: Path to STL file for terrain geometry (default: southken.stl)
- `--wind-resolution`: Wind field grid resolution in meters (default: 10)
- `--grid-resolution`: Pathfinding grid resolution in meters (default: 20)

**Weight configs:** Speed (`w1=0.3, w2=0.6, w3=0.1`), Safety (`w1=0.2, w2=0.2, w3=0.6`), Balanced (`w1=0.33, w2=0.33, w3=0.34`)

### Frontend

```bash
cd frontend/ichack26
npm install
npm run dev
```

Connect to: `ws://localhost:8765`

## WebSocket API Reference

### Get Scene Info

**Request:** `{"type": "get_scene"}`

**Response:** Returns bounds, grid_resolution, wind_base_direction, buildings array, and wind_field_shape.

### Get Wind Field

**Request:** `{"type": "get_wind_field", "downsample": 2}`

**Response:** Returns wind_vectors (flattened [vx,vy,vz] array) and turbulence (0-1 values). Array layout is C-order (x varies fastest, then y, then z).

### Get Everything

**Request:** `{"type": "get_all", "downsample": 2}`

**Response:** Combined scene + wind field data.

### Start Simulation

**Request:**
```json
{
  "type": "start",
  "start": [180, 100, 40],
  "end": [20, 100, 40],
  "route_type": "both"
}
```

### Message Types During Simulation

1. **paths** - Sent immediately with naive and optimized waypoint arrays
2. **simulation_start** - Per route, includes waypoint_count
3. **frame** - Streamed at ~20 FPS with position, velocity, heading, wind, drift, correction, effort, airspeed, groundspeed
4. **simulation_end** - Per route, includes flight_summary and metrics
5. **complete** - Final comparison metrics for both routes

### Key Frame Fields

| Field | Description |
|-------|-------------|
| `position` | [x, y, z] drone world position (meters) |
| `heading` | Unit vector - drone nose direction (may differ from velocity due to crabbing) |
| `effort` | 0-1, how hard drone is working |
| `wind` | [wx, wy, wz] wind at drone position (m/s) |
| `drift` | Crosswind component pushing drone off course |
| `correction` | Heading correction being applied |

### Coordinate System

- **Origin**: bounds.min (typically [0, 0, 0])
- **X-axis**: Eastward (primary wind direction)
- **Y-axis**: Northward
- **Z-axis**: Upward (altitude)
- **Units**: Meters for position, m/s for velocity

## Tech Stack

- **Backend**: Python (Dijkstra pathfinding, physics simulation, WebSocket server)
- **Frontend**: React + TypeScript + Vite, Three.js via @react-three/fiber + @react-three/drei

## Remaining TODO

- [ ] Two-phase demo orchestration (route creation animation → drone flight)
- [ ] Third-person camera following drones
- [ ] Animated path drawing showing algorithm exploration
- [ ] Play/pause/restart controls
