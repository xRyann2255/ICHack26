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
4. [ ] **Step 4: Mock data generator** - Generate test wind/building data
5. [ ] **Step 5: Wind field** - `WindField` class with interpolation
6. [ ] **Step 6: Cost calculator** - Edge cost computation with wind awareness
7. [ ] **Step 7: Dijkstra router** - Pathfinding with exploration history
8. [ ] **Step 8: Naive router** - A* comparison baseline
9. [ ] **Step 9: Path smoother** - Spline interpolation
10. [ ] **Step 10: Metrics calculator** - All 5 metrics from spec
11. [ ] **Step 11: Serializer** - JSON output for frontend
12. [ ] **Step 12: Main entry point** - CLI integration

### Verification at Each Step

After completing each step:
- Run unit tests or manual verification
- Confirm the component integrates with previous work
- Document any deviations from the plan