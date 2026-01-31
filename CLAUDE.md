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
| Naive route (straight line, no wind consideration) | Wind-aware route (accounts for CFD simulation) |

This phase illustrates HOW the algorithm explores the space and arrives at different routes.

### Phase 2: 3D Flight Simulation (Side-by-Side)

A side-by-side 3D visualization showing the drone flying each route.

| Left Panel | Right Panel |
|------------|-------------|
| Naive route with NO wind rendering | Wind-aware route with CFD wind streamlines rendered |
| Drone flies the straight-line path | Drone flies the optimized path |
| Clean/calm visual aesthetic | Dynamic wind visualization |

This phase shows the RESULT and lets viewers compare the two approaches visually.

---

## Route Algorithm

### Cost Function

```
cost(edge) = w1 * distance
           + w2 * headwind_resistance * time
           + w3 * turbulence_intensity * distance
```

Where:
- `w1`, `w2`, `w3` are tunable weights
- `distance` is the Euclidean distance of the edge
- `headwind_resistance` is the component of wind opposing drone travel direction
- `time` is the estimated traversal time for the edge
- `turbulence_intensity` is the CFD-derived turbulence at that location

### Metrics to Compute

For each route (naive and optimized), compute and display:

1. **Total distance** — path length in meters
2. **Estimated flight time** — based on drone speed and wind resistance
3. **Energy consumption estimate** — relative energy cost accounting for wind
4. **Crash/instability probability** — derived from turbulence exposure
5. **Number of high-turbulence zones crossed** — count of dangerous areas traversed

These metrics should be displayed comparatively to highlight the benefits of wind-aware routing.

---

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

To be agreed upon with teammates. Suggested: NumPy `.npz` for wind data, JSON or OBJ for geometry.

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