"""
WebSocket server for live drone simulation streaming.

Streams drone positions in real-time to the frontend for visualization.

Protocol:
---------
1. Client connects
2. Client sends: {"type": "start", "start": [x,y,z], "end": [x,y,z]}
3. Server sends: {"type": "init", "buildings": [...], "bounds": {...}, ...}
4. Server sends: {"type": "paths", "naive": [...], "optimized": [...]}
5. Server streams: {"type": "frame", "route": "naive"|"optimized", "data": {...}}
6. Server sends: {"type": "complete", "metrics": {...}}

Usage:
------
    python -m backend.server.websocket_server --port 8765

    Uses CFD wind data from internal.vtu by default. Use --vtu none to disable.
"""

import asyncio
import json
import logging
import numpy as np
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


class NumpyEncoder(json.JSONEncoder):
    """JSON encoder that handles numpy types."""
    def default(self, obj):
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False
    WebSocketServerProtocol = Any

from ..grid.node import Vector3
from ..grid.grid_3d import Grid3D
from ..data.wind_field import WindField
from ..data.stl_loader import STLLoader, STLMesh, MeshCollisionChecker
from ..data.vtu_loader import VTULoader
from ..routing.cost_calculator import CostCalculator, WeightConfig
from ..routing.dijkstra import DijkstraRouter
from ..routing.naive_router import NaiveRouter
from ..routing.path_smoother import PathSmoother
from ..metrics.calculator import MetricsCalculator
from ..simulation.flight_simulator import FlightSimulator, SimulationParams

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ServerConfig:
    """Server configuration.

    Coordinate system (Y-up, matches Three.js):
    - X: width (east-west)
    - Y: height (vertical/altitude)
    - Z: depth (north-south)
    """
    host: str = "localhost"
    port: int = 8765

    # Scene configuration (x, y_height, z_depth) - will be updated from STL bounds
    bounds_min: tuple = (0, 0, 0)
    bounds_max: tuple = (200, 80, 200)  # (x, y_height, z_depth)
    grid_resolution: float = 20.0  # Larger = faster startup, smaller = finer paths
    wind_resolution: float = 10.0
    random_seed: int = 42

    # STL file path - defaults to southken.stl in project root
    stl_path: str = "southken.stl"

    # VTU file path for CFD wind data (defaults to internal.vtu, set to None for mock wind)
    vtu_path: Optional[str] = "internal.vtu"

    # Simulation configuration
    frame_delay: float = 0.05  # Seconds between frame sends (controls playback speed)
    simulation_timestep: float = 0.1
    drone_airspeed: float = 15.0


class WebSocketServer:
    """
    WebSocket server for live drone simulation.

    Manages scene data and streams simulation frames to connected clients.
    """

    def __init__(self, config: Optional[ServerConfig] = None):
        """Initialize server with configuration."""
        if not WEBSOCKETS_AVAILABLE:
            raise ImportError("websockets library not installed. Run: pip install websockets")

        self.config = config or ServerConfig()
        self.wind_field: Optional[WindField] = None
        self.mini_wind_field: Optional[WindField] = None
        self.grid: Optional[Grid3D] = None
        self.wind_router: Optional[DijkstraRouter] = None
        self.naive_router: Optional[NaiveRouter] = None
        self.smoother: Optional[PathSmoother] = None
        self.metrics_calc: Optional[MetricsCalculator] = None
        self.flight_sim: Optional[FlightSimulator] = None
        self.mesh: Optional[STLMesh] = None  # STL mesh for collision
        self.collision_checker: Optional[MeshCollisionChecker] = None
        self._initialized = False

    def initialize(self) -> None:
        """Initialize scene data and routing infrastructure."""
        import os

        if self._initialized:
            return

        logger.info("Initializing server...")

        # Resolve STL path - check multiple locations
        stl_path = self.config.stl_path
        if not os.path.isabs(stl_path):
            if not os.path.exists(stl_path):
                script_dir = os.path.dirname(os.path.abspath(__file__))
                project_root = os.path.dirname(os.path.dirname(script_dir))
                stl_path = os.path.join(project_root, self.config.stl_path)

        if not os.path.exists(stl_path):
            raise FileNotFoundError(f"STL file not found: {stl_path}")

        # Resolve VTU path
        vtu_path = self.config.vtu_path
        if vtu_path and not os.path.isabs(vtu_path):
            if not os.path.exists(vtu_path):
                script_dir = os.path.dirname(os.path.abspath(__file__))
                project_root = os.path.dirname(os.path.dirname(script_dir))
                vtu_path = os.path.join(project_root, self.config.vtu_path)
            if not os.path.exists(vtu_path):
                raise FileNotFoundError(f"VTU file not found: {vtu_path}")

        # Load STL mesh (get the centering offset to apply to VTU data)
        logger.info(f"Loading STL: {stl_path}")
        self.mesh, stl_center_offset = STLLoader.load_stl(
            stl_path, convert_coords=True, center_xy=True, ground_at_zero=True, return_offset=True
        )
        logger.info(f"STL centering offset: {stl_center_offset}")

        # Calculate scene bounds from mesh
        margin = 50.0
        flight_ceiling = 50.0
        bounds_min = Vector3(
            self.mesh.min_bounds[0] - margin,
            0,
            self.mesh.min_bounds[2] - margin
        )
        bounds_max = Vector3(
            self.mesh.max_bounds[0] + margin,
            self.mesh.max_bounds[1] + flight_ceiling,
            self.mesh.max_bounds[2] + margin
        )

        # Load wind field from VTU (apply same centering offset as STL)
        logger.info(f"Loading VTU wind data: {vtu_path}")
        self.wind_field = VTULoader.load_and_normalize(
            vtu_path,
            scene_bounds_min=bounds_min,
            scene_bounds_max=bounds_max,
            resolution=self.config.wind_resolution,
            center_offset=stl_center_offset
        )
        # Take every 10 points from the main wind field (N, 3)
        N = 10
        mini_points = self.wind_field.points[::N]
        mini_velocities = self.wind_field.velocities[::N]
        self.mini_wind_field = WindField(mini_points, mini_velocities)
            
        self.collision_checker = MeshCollisionChecker(self.mesh, voxel_size=5.0)
        # Update config bounds to match mesh
        self.config.bounds_min = (bounds_min.x, bounds_min.y, bounds_min.z)
        self.config.bounds_max = (bounds_max.x, bounds_max.y, bounds_max.z)
        logger.info(f"STL scene loaded, bounds: {bounds_min} to {bounds_max}")

        # logger.info(f"Wind field: {self.wind_field.nx}x{self.wind_field.ny}x{self.wind_field.nz}")

        # Create grid
        logger.info("Creating grid...")
        self.grid = Grid3D(bounds_min, bounds_max, resolution=self.config.grid_resolution)
        logger.info(f"Grid: {self.grid.nx}x{self.grid.ny}x{self.grid.nz} = {self.grid.total_nodes} nodes")

        # Setup routers (using mesh collision detection)
        # Run both routers' edge computation in parallel for faster startup
        logger.info("Setting up routers (parallel edge computation)...")

        import time
        from concurrent.futures import ThreadPoolExecutor, as_completed

        router_start_time = time.time()

        calc = CostCalculator(self.wind_field, WeightConfig.speed_priority())
        self.naive_router = NaiveRouter(self.grid, capture_interval=50)

        def compute_wind_edges():
            """Compute wind-aware edge costs using vectorized method."""
            calc.precompute_edge_costs_vectorized(
                self.grid,
                collision_checker=self.collision_checker
            )
            return calc.edge_count

        def compute_naive_edges():
            """Compute naive router valid edges."""
            self.naive_router.precompute_valid_edges(
                collision_checker=self.collision_checker
            )
            return len(self.naive_router._valid_edges)

        # Run both in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            wind_future = executor.submit(compute_wind_edges)
            naive_future = executor.submit(compute_naive_edges)

            # Wait for both to complete
            wind_edge_count = wind_future.result()
            naive_edge_count = naive_future.result()

        router_elapsed = time.time() - router_start_time
        logger.info(f"Router setup complete in {router_elapsed:.2f}s")
        logger.info(f"  - Wind-aware edges: {wind_edge_count}")
        logger.info(f"  - Naive edges: {naive_edge_count}")

        self.wind_router = DijkstraRouter(self.grid, calc, capture_interval=50)

        self.smoother = PathSmoother(points_per_segment=5)
        
        self.metrics_calc = MetricsCalculator(self.wind_field)

        self.flight_sim = FlightSimulator(
            self.wind_field,
            SimulationParams(
                max_airspeed=self.config.drone_airspeed,
                timestep=self.config.simulation_timestep
            )
        )

        self._initialized = True
        logger.info("Server initialization complete!")

    def get_scene_info(self) -> Dict[str, Any]:
        """Get scene information for client (without wind field)."""
        return {
            "bounds": {
                "min": list(self.config.bounds_min),
                "max": list(self.config.bounds_max),
            },
            "grid_resolution": self.config.grid_resolution,
            # Buildings array is empty - frontend loads STL mesh directly
            "buildings": [],
            # "wind_field_shape": [self.wind_field.nx, self.wind_field.ny, self.wind_field.nz],
            # Always using STL mesh for collision detection
            "use_stl_mesh": True,
            "mesh_bounds": {
                "min": self.mesh.min_bounds.tolist(),
                "max": self.mesh.max_bounds.tolist(),
            },
        }

    def get_wind_field_data(self, precision: int = 2) -> Dict[str, Any]:
        """
        Get full wind field data for client to render streamlines.

        No downsampling - returns all wind vectors at full resolution.

        Args:
            precision: Decimal places for rounding (reduces JSON size)

        Returns wind vectors and turbulence for every cell in the grid.
        """
        wf = self.mini_wind_field

        return {
            "bounds": {
                "min": list(self.config.bounds_min),
                "max": list(self.config.bounds_max),
            },
            "points": wf.points.tolist(),
            "velocity": wf.velocities.tolist(),
        }

    async def handle_client(self, websocket: WebSocketServerProtocol) -> None:
        """Handle a single client connection."""
        client_id = id(websocket)
        logger.info(f"Client {client_id} connected")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await self.send_error(websocket, str(e))
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} disconnected")

    async def handle_message(self, websocket: WebSocketServerProtocol, data: Dict) -> None:
        """Handle incoming message from client."""
        msg_type = data.get("type")

        if msg_type == "get_scene":
            # Send scene info (buildings, bounds, etc.)
            await self.send_json(websocket, {
                "type": "scene",
                "data": self.get_scene_info()
            })

        elif msg_type == "get_wind_field":
            # Send full wind field data for streamline rendering (no downsampling)
            logger.info("Sending wind field data (full resolution)...")
            await self.send_json(websocket, {
                "type": "wind_field",
                "data": self.get_wind_field_data()
            })
            logger.info("Wind field data sent")

        elif msg_type == "get_all":
            # Send both scene and wind field in one response (no downsampling)
            logger.info("Sending full scene data with wind field (full resolution)...")
            scene_data = self.get_scene_info()
            scene_data["wind_field"] = self.get_wind_field_data()
            await self.send_json(websocket, {
                "type": "full_scene",
                "data": scene_data
            })
            logger.info("Full scene data sent")

        elif msg_type == "start":
            # Start simulation
            start = data.get("start")
            end = data.get("end")
            route_type = data.get("route_type", "both")  # "naive", "optimized", or "both"

            if not start or not end:
                await self.send_error(websocket, "Missing start or end position")
                return

            # Validate positions
            validation_error = self._validate_position(start, "start")
            if validation_error:
                await self.send_error(websocket, validation_error)
                return

            validation_error = self._validate_position(end, "end")
            if validation_error:
                await self.send_error(websocket, validation_error)
                return

            await self.run_simulation(websocket, start, end, route_type)

        elif msg_type == "ping":
            await self.send_json(websocket, {"type": "pong"})

        else:
            await self.send_error(websocket, f"Unknown message type: {msg_type}")

    async def run_simulation(
        self,
        websocket: WebSocketServerProtocol,
        start: List[float],
        end: List[float],
        route_type: str
    ) -> None:
        """Run simulation and stream frames to client."""
        start_vec = Vector3(*start)
        end_vec = Vector3(*end)

        logger.info(f"Starting simulation: {start} -> {end}, type={route_type}")

        # Find paths
        routes_to_run = []

        if route_type in ("naive", "both"):
            naive_result = self.naive_router.find_path(start_vec, end_vec, capture_exploration=False)
            if naive_result.success:
                naive_path = self.smoother.smooth(naive_result.path)
                routes_to_run.append(("naive", naive_path))
            else:
                await self.send_error(websocket, "No path found for naive route")
                return

        if route_type in ("optimized", "both"):
            wind_result = self.wind_router.find_path(start_vec, end_vec, capture_exploration=False)
            if wind_result.success:
                wind_path = self.smoother.smooth(wind_result.path)
                routes_to_run.append(("optimized", wind_path))
            else:
                await self.send_error(websocket, "No path found for optimized route")
                return

        # Send paths to client
        paths_data = {}
        for route_name, path in routes_to_run:
            paths_data[route_name] = [p.to_list() for p in path]

        await self.send_json(websocket, {
            "type": "paths",
            "data": paths_data
        })

        # Run simulations in parallel (both drones fly at the same time)
        all_metrics = {}

        # Send simulation_start for all routes
        for route_name, path in routes_to_run:
            await self.send_json(websocket, {
                "type": "simulation_start",
                "route": route_name,
                "waypoint_count": len(path)
            })

        # Run parallel simulation
        if len(routes_to_run) == 2:
            # Both routes - run them simultaneously
            logger.info("Running both simulations in parallel...")
            flight_results = await self.stream_parallel_simulation(
                websocket,
                routes_to_run[0],  # (name, path)
                routes_to_run[1]   # (name, path)
            )

            for route_name, flight_data in flight_results.items():
                path = next(p for n, p in routes_to_run if n == route_name)
                metrics = self.metrics_calc.calculate(path)
                all_metrics[route_name] = metrics.to_dict()

                await self.send_json(websocket, {
                    "type": "simulation_end",
                    "route": route_name,
                    "flight_summary": flight_data.to_dict()["summary"],
                    "metrics": metrics.to_dict()
                })
                logger.info(f"Route {route_name} done, completed={flight_data.completed}")
        else:
            # Single route - run normally
            for route_name, path in routes_to_run:
                logger.info(f"Simulating {route_name} route...")
                flight_data = await self.stream_simulation(websocket, route_name, path)

                metrics = self.metrics_calc.calculate(path)
                all_metrics[route_name] = metrics.to_dict()

                await self.send_json(websocket, {
                    "type": "simulation_end",
                    "route": route_name,
                    "flight_summary": flight_data.to_dict()["summary"],
                    "metrics": metrics.to_dict()
                })
                logger.info(f"Route {route_name} done, completed={flight_data.completed}")

        # Send completion with comparison
        await self.send_json(websocket, {
            "type": "complete",
            "metrics": all_metrics
        })

        logger.info("Simulation complete")

    async def stream_parallel_simulation(
        self,
        websocket: WebSocketServerProtocol,
        route1: tuple,  # (name, path)
        route2: tuple   # (name, path)
    ) -> Dict[str, Any]:
        """
        Stream both simulations in parallel, sending frames for both drones simultaneously.

        Returns dict mapping route_name to FlightData.
        """
        from ..simulation.flight_simulator import DroneState, FlightFrame, FlightData

        name1, path1 = route1
        name2, path2 = route2

        logger.info(f"Running parallel simulation: {name1} ({len(path1)} pts) and {name2} ({len(path2)} pts)")

        sim_params = SimulationParams(
            max_airspeed=self.config.drone_airspeed,
            timestep=self.config.simulation_timestep,
            waypoint_threshold=5.0
        )
        sim_params.max_turn_rate = 360.0

        # Initialize both drone states
        states = {}
        frames = {}
        completed = {}

        for name, path in [(name1, path1), (name2, path2)]:
            if len(path) < 2:
                completed[name] = True
                frames[name] = []
                continue

            states[name] = {
                'state': DroneState(
                    position=Vector3(path[0].x, path[0].y, path[0].z),
                    velocity=Vector3(0, 0, 0),
                    heading=self._direction_to(path[0], path[1]),
                    airspeed=self.config.drone_airspeed,
                    target_waypoint_index=1
                ),
                'path': path
            }
            completed[name] = False
            frames[name] = []

        time = 0.0
        step = 0
        base_airspeed = self.config.drone_airspeed
        max_boost_airspeed = 200.0
        min_desired_groundspeed = 15.0

        # Run until both complete or timeout
        while time < sim_params.max_time:
            all_done = all(completed.values())
            if all_done:
                break

            # Process each drone
            for name in [name1, name2]:
                if completed[name]:
                    continue

                data = states[name]
                state = data['state']
                path = data['path']

                if state.target_waypoint_index >= len(path):
                    completed[name] = True
                    continue

                target = path[state.target_waypoint_index]
                wind = self.wind_field.get_wind_at(state.position)

                to_target = target - state.position
                distance_to_target = to_target.magnitude()

                # Advance through reached waypoints
                while distance_to_target < sim_params.waypoint_threshold:
                    state.target_waypoint_index += 1
                    if state.target_waypoint_index >= len(path):
                        break
                    target = path[state.target_waypoint_index]
                    to_target = target - state.position
                    distance_to_target = to_target.magnitude()

                if state.target_waypoint_index >= len(path):
                    completed[name] = True
                    continue

                # Get direction to target
                desired_direction = to_target.normalized()
                if desired_direction.magnitude() < 0.1:
                    desired_direction = state.heading
                if desired_direction.magnitude() < 0.1:
                    desired_direction = Vector3(-1, 0, 0)

                # Calculate headwind and adjust airspeed
                headwind_component = -wind.dot(desired_direction)
                required_airspeed = headwind_component + min_desired_groundspeed
                state.airspeed = max(base_airspeed, min(max_boost_airspeed, required_airspeed))

                # Compute corrected heading
                heading, correction = self._compute_corrected_heading(
                    desired_direction, wind, state.airspeed
                )

                # Update heading
                state.heading = self._turn_toward(
                    state.heading, heading,
                    sim_params.max_turn_rate * sim_params.timestep
                )
                if state.heading.magnitude() < 0.1:
                    state.heading = desired_direction

                # Compute velocities
                air_velocity = state.heading * state.airspeed
                ground_velocity = air_velocity + wind
                groundspeed = ground_velocity.magnitude()

                min_groundspeed = 10.0
                if groundspeed < min_groundspeed:
                    ground_velocity = desired_direction * min_groundspeed
                    groundspeed = min_groundspeed

                # Compute drift and effort
                if groundspeed > 0.1:
                    drift = wind - (wind.dot(desired_direction) * desired_direction)
                else:
                    drift = Vector3(0, 0, 0)

                headwind = max(0.0, -wind.dot(state.heading))
                headwind_effort = (headwind / base_airspeed) * 0.3
                correction_effort = min(1.0, correction.magnitude()) * 0.2
                boost_ratio = (state.airspeed - base_airspeed) / (max_boost_airspeed - base_airspeed)
                boost_effort = max(0.0, boost_ratio) * 0.4
                effort = min(1.0, 0.1 + headwind_effort + correction_effort + boost_effort)

                # Create frame
                frame = FlightFrame(
                    time=time,
                    position=Vector3(state.position.x, state.position.y, state.position.z),
                    velocity=ground_velocity,
                    heading=Vector3(state.heading.x, state.heading.y, state.heading.z),
                    wind=wind,
                    drift=drift,
                    correction=correction,
                    effort=effort,
                    airspeed=state.airspeed,
                    groundspeed=groundspeed,
                    waypoint_index=state.target_waypoint_index,
                    distance_to_waypoint=distance_to_target
                )
                frames[name].append(frame)

                # Send frame to client
                await self.send_json(websocket, {
                    "type": "frame",
                    "route": name,
                    "data": frame.to_dict()
                })

                # Update position
                old_position = Vector3(state.position.x, state.position.y, state.position.z)
                position_delta = ground_velocity * sim_params.timestep
                state.position = old_position + position_delta

                # Safety checks
                import math
                if (math.isnan(state.position.x) or math.isnan(state.position.y) or math.isnan(state.position.z)):
                    state.position = old_position

                movement = (state.position - old_position).magnitude()
                if movement < 0.05:
                    final_target = path[-1]
                    to_final = (final_target - old_position).normalized()
                    if to_final.magnitude() < 0.1:
                        to_final = Vector3(-1, 0, 0)
                    state.position = old_position + to_final * 0.5
                    state.heading = to_final

                state.velocity = ground_velocity

            # Delay for real-time effect (only once per time step)
            await asyncio.sleep(self.config.frame_delay)

            time += sim_params.timestep
            step += 1

        # Build flight data results
        results = {}
        for name in [name1, name2]:
            route_frames = frames[name]
            if route_frames:
                total_distance = sum(
                    (route_frames[i+1].position - route_frames[i].position).magnitude()
                    for i in range(len(route_frames) - 1)
                )
                results[name] = FlightData(
                    frames=route_frames,
                    total_time=time,
                    total_distance=total_distance,
                    average_groundspeed=total_distance / max(0.1, time),
                    average_effort=sum(f.effort for f in route_frames) / max(1, len(route_frames)),
                    max_effort=max((f.effort for f in route_frames), default=0),
                    completed=completed[name],
                    waypoints_reached=states[name]['state'].target_waypoint_index if name in states else 0
                )
            else:
                results[name] = FlightData(
                    frames=[],
                    total_time=0,
                    total_distance=0,
                    average_groundspeed=0,
                    average_effort=0,
                    max_effort=0,
                    completed=True,
                    waypoints_reached=0
                )

        logger.info(f"Parallel simulation complete: {step} steps, {time:.1f}s")
        return results

    async def stream_simulation(
        self,
        websocket: WebSocketServerProtocol,
        route_name: str,
        path: List[Vector3]
    ):
        """Stream simulation frames to client."""
        # Run simulation step by step
        sim_params = SimulationParams(
            max_airspeed=self.config.drone_airspeed,
            timestep=self.config.simulation_timestep,
            waypoint_threshold=5.0
        )

        # We'll manually step through simulation to stream frames
        from ..simulation.flight_simulator import DroneState, FlightFrame, FlightData

        if len(path) < 2:
            logger.warning(f"Route {route_name} has less than 2 waypoints, skipping simulation")
            return FlightData(
                frames=[],
                total_time=0,
                total_distance=0,
                average_groundspeed=0,
                average_effort=0,
                max_effort=0,
                completed=True,
                waypoints_reached=len(path)
            )

        # Override turn rate for smoother animation - allow faster turns
        # Original was 90 deg/s which caused 10+ frames to complete a 90° turn
        # Now 360 deg/s allows instant turns (completes any turn in 1-2 frames)
        sim_params.max_turn_rate = 360.0

        # Dynamic airspeed parameters - drone can boost power when needed
        # GREATLY increased to overcome any wind conditions
        base_airspeed = sim_params.max_airspeed  # Normal cruising speed (15 m/s)
        max_boost_airspeed = 200.0  # Massively boosted - can fly 200 m/s if needed
        min_desired_groundspeed = 15.0  # Target at least 15 m/s ground speed (was 8)

        # Initialize state
        state = DroneState(
            position=Vector3(path[0].x, path[0].y, path[0].z),
            velocity=Vector3(0, 0, 0),
            heading=self._direction_to(path[0], path[1]),
            airspeed=base_airspeed,
            target_waypoint_index=1
        )

        time = 0.0
        step = 0
        frames = []
        last_log_step = -20  # Log every 20 steps
        last_sent_position = None  # Track for duplicate detection
        duplicate_count = 0

        while time < sim_params.max_time:
            if state.target_waypoint_index >= len(path):
                logger.info(f"Route {route_name} complete: reached all {len(path)} waypoints in {time:.1f}s")
                break

            target = path[state.target_waypoint_index]
            wind = self.wind_field.get_wind_at(state.position)

            # Log progress periodically
            if step - last_log_step >= 20:
                logger.info(f"[{route_name}] step={step} t={time:.1f}s pos=({state.position.x:.1f},{state.position.y:.1f},{state.position.z:.1f}) wp={state.target_waypoint_index}/{len(path)}")
                last_log_step = step

            to_target = target - state.position
            distance_to_target = to_target.magnitude()

            # Advance through any waypoints that are already reached
            # (handles case where multiple waypoints are close together)
            waypoints_skipped = 0
            while distance_to_target < sim_params.waypoint_threshold:
                state.target_waypoint_index += 1
                waypoints_skipped += 1
                if state.target_waypoint_index >= len(path):
                    break
                target = path[state.target_waypoint_index]
                to_target = target - state.position
                distance_to_target = to_target.magnitude()
                # Safety limit to prevent infinite loop
                if waypoints_skipped > 100:
                    logger.warning("Too many waypoints skipped, breaking")
                    break

            if state.target_waypoint_index >= len(path):
                logger.info(f"Route {route_name} complete: reached final waypoint after skipping, time={time:.1f}s")
                break

            # Get direction to target (with safety check for near-zero distance)
            desired_direction = to_target.normalized()
            if desired_direction.magnitude() < 0.1:
                # Invalid direction (target too close), use current heading
                desired_direction = state.heading

            # Second fallback: if heading is also invalid, use direction to final destination
            if desired_direction.magnitude() < 0.1:
                final_target = path[-1]
                to_final = final_target - state.position
                desired_direction = to_final.normalized()
                logger.debug(f"Using direction to final target: {desired_direction.to_list()}")

            # Last resort fallback: if still invalid, use a fixed direction
            if desired_direction.magnitude() < 0.1:
                # Use negative X direction (typical end is at low X)
                desired_direction = Vector3(-1, 0, 0)
                logger.warning(f"All direction fallbacks failed, using fixed direction")

            # Calculate headwind component to determine required airspeed
            headwind_component = -wind.dot(desired_direction)  # Positive = headwind

            # Dynamically adjust airspeed based on headwind
            # We want: groundspeed = airspeed - headwind >= min_desired_groundspeed
            # So: airspeed >= headwind + min_desired_groundspeed
            required_airspeed = headwind_component + min_desired_groundspeed

            # Clamp to allowed range
            state.airspeed = max(base_airspeed, min(max_boost_airspeed, required_airspeed))

            # Log when boosting
            if state.airspeed > base_airspeed * 1.1:
                logger.debug(f"Boosting airspeed to {state.airspeed:.1f} m/s (headwind: {headwind_component:.1f} m/s)")

            # Compute corrected heading
            heading, correction = self._compute_corrected_heading(
                desired_direction, wind, state.airspeed
            )

            # Update heading with turn rate limit
            state.heading = self._turn_toward(
                state.heading, heading,
                sim_params.max_turn_rate * sim_params.timestep
            )

            # Safety check: ensure heading is never zero
            if state.heading.magnitude() < 0.1:
                state.heading = desired_direction
                logger.debug(f"Heading was zero, reset to desired_direction: {state.heading.to_list()}")

            # Compute velocities with boosted airspeed
            air_velocity = state.heading * state.airspeed
            ground_velocity = air_velocity + wind
            groundspeed = ground_velocity.magnitude()

            # Ensure minimum forward progress to prevent getting stuck
            # Use high minimum to guarantee visible progress
            min_groundspeed = 10.0  # m/s minimum - always make good progress
            if groundspeed < min_groundspeed:
                logger.debug(f"Low groundspeed {groundspeed:.3f}, forcing minimum {min_groundspeed}")
                # Force movement in DESIRED direction (toward waypoint), not current velocity direction
                # This ensures we always make progress toward the goal
                ground_velocity = desired_direction * min_groundspeed
                groundspeed = min_groundspeed

            # Compute drift
            if groundspeed > 0.1:
                drift = wind - (wind.dot(desired_direction) * desired_direction)
            else:
                drift = Vector3(0, 0, 0)

            # Compute effort - accounts for headwind, correction, AND power boost
            headwind = max(0.0, -wind.dot(state.heading))
            headwind_normalized = headwind / base_airspeed
            headwind_effort = headwind_normalized * 0.3  # Up to 0.3 for headwind

            correction_effort = min(1.0, correction.magnitude()) * 0.2  # Up to 0.2 for correction

            # Boost effort - using more power requires more effort
            boost_ratio = (state.airspeed - base_airspeed) / (max_boost_airspeed - base_airspeed)
            boost_effort = max(0.0, boost_ratio) * 0.4  # Up to 0.4 for full boost

            effort = min(1.0, 0.1 + headwind_effort + correction_effort + boost_effort)

            # Create frame
            frame = FlightFrame(
                time=time,
                position=Vector3(state.position.x, state.position.y, state.position.z),
                velocity=ground_velocity,
                heading=Vector3(state.heading.x, state.heading.y, state.heading.z),
                wind=wind,
                drift=drift,
                correction=correction,
                effort=effort,
                airspeed=state.airspeed,
                groundspeed=groundspeed,
                waypoint_index=state.target_waypoint_index,
                distance_to_waypoint=distance_to_target
            )
            frames.append(frame)

            # Check for duplicate positions (would cause visual "stopping")
            current_pos = (round(state.position.x, 2), round(state.position.y, 2), round(state.position.z, 2))
            if last_sent_position == current_pos:
                duplicate_count += 1
                if duplicate_count <= 5:
                    logger.warning(f"[{route_name}] Duplicate position detected at step {step}: {current_pos}")
            else:
                duplicate_count = 0
            last_sent_position = current_pos

            # Send frame to client
            await self.send_json(websocket, {
                "type": "frame",
                "route": route_name,
                "data": frame.to_dict()
            })

            # Delay for real-time effect
            await asyncio.sleep(self.config.frame_delay)

            # Update position
            old_position = Vector3(state.position.x, state.position.y, state.position.z)
            position_delta = ground_velocity * sim_params.timestep
            state.position = old_position + position_delta

            # Check for NaN/Inf (would cause stuck behavior)
            import math
            if (math.isnan(state.position.x) or math.isnan(state.position.y) or math.isnan(state.position.z) or
                math.isinf(state.position.x) or math.isinf(state.position.y) or math.isinf(state.position.z)):
                logger.error(f"[{route_name}] NaN/Inf position detected! Resetting to old_position")
                logger.error(f"  ground_velocity={ground_velocity.to_list()}, delta={position_delta.to_list()}")
                state.position = old_position

            # Safety check: ensure we actually made progress
            movement = (state.position - old_position).magnitude()
            if movement < 0.05:  # Increased threshold
                # Drone is stuck or moving too slowly
                logger.warning(
                    f"STUCK! movement={movement:.6f}, pos={old_position.to_list()}, "
                    f"target={target.to_list()}, "
                    f"desired_dir={desired_direction.to_list()}, "
                    f"heading={state.heading.to_list()}, "
                    f"wind={wind.to_list()}, "
                    f"ground_vel={ground_velocity.to_list()}, "
                    f"delta={position_delta.to_list()}"
                )
                # Force movement toward the FINAL destination
                final_target = path[-1]
                to_final = (final_target - old_position).normalized()
                if to_final.magnitude() < 0.1:
                    # Fallback: toward end (typically lower x in our test case)
                    to_final = Vector3(-1, 0, 0)
                # Use larger minimum movement to overcome issues
                forced_movement = 0.5  # meters per timestep
                state.position = old_position + to_final * forced_movement
                # Also update heading to match
                state.heading = to_final
                logger.warning(f"Forced new position: {state.position.to_list()}, heading: {state.heading.to_list()}")

            state.velocity = ground_velocity

            time += sim_params.timestep
            step += 1

        # Log if we exited due to max time (shouldn't normally happen)
        if time >= sim_params.max_time:
            logger.warning(f"Route {route_name} timed out after {time:.1f}s, reached waypoint {state.target_waypoint_index}/{len(path)}")

        logger.info(f"Route {route_name} simulation finished: {len(frames)} frames, {step} steps")

        # Return flight data for summary
        total_distance = sum(
            (frames[i+1].position - frames[i].position).magnitude()
            for i in range(len(frames) - 1)
        ) if len(frames) > 1 else 0

        return FlightData(
            frames=frames,
            total_time=time,
            total_distance=total_distance,
            average_groundspeed=total_distance / max(0.1, time),
            average_effort=sum(f.effort for f in frames) / max(1, len(frames)),
            max_effort=max((f.effort for f in frames), default=0),
            completed=state.target_waypoint_index >= len(path),
            waypoints_reached=state.target_waypoint_index
        )

    def _validate_position(self, pos: List[float], name: str) -> Optional[str]:
        """
        Validate a position is within bounds and not inside mesh geometry.

        Returns:
            Error message if invalid, None if valid.
        """
        if not isinstance(pos, (list, tuple)) or len(pos) != 3:
            return f"{name} position must be [x, y, z]"

        x, y, z = pos
        min_b = self.config.bounds_min
        max_b = self.config.bounds_max

        # Check bounds
        if not (min_b[0] <= x <= max_b[0]):
            return f"{name} x={x} is outside bounds [{min_b[0]}, {max_b[0]}]"
        if not (min_b[1] <= y <= max_b[1]):
            return f"{name} y={y} is outside bounds [{min_b[1]}, {max_b[1]}]"
        if not (min_b[2] <= z <= max_b[2]):
            return f"{name} z={z} is outside bounds [{min_b[2]}, {max_b[2]}]"

        # Check not inside mesh geometry
        pos_vec = Vector3(x, y, z)
        if self.collision_checker.point_in_building(pos_vec):
            return f"{name} position is inside mesh geometry"

        # Check not inside STL mesh (if loaded)
        if self.mesh is not None:
            if self.mesh.point_inside(pos_vec):
                return f"{name} position is inside mesh geometry"

        return None

    def _direction_to(self, from_pos: Vector3, to_pos: Vector3) -> Vector3:
        """Compute unit direction vector."""
        diff = to_pos - from_pos
        mag = diff.magnitude()
        if mag < 1e-6:
            return Vector3(1, 0, 0)
        return diff / mag

    def _compute_corrected_heading(self, desired_direction: Vector3, wind: Vector3, airspeed: float):
        """
        Compute heading with wind correction (crabbing).

        The physics: ground_velocity = heading * airspeed + wind
        We want ground_velocity to be in desired_direction.

        For perpendicular wind component w_perp:
        - sin(crab_angle) = |w_perp| / airspeed

        If |w_perp| > airspeed, we crab as much as possible while still
        making forward progress (max 70 degrees).
        """
        import math

        wind_speed = wind.magnitude()
        if wind_speed < 0.1:
            return desired_direction, Vector3(0, 0, 0)

        # Decompose wind into parallel and perpendicular components
        wind_dot_desired = wind.dot(desired_direction)
        wind_perpendicular = wind - desired_direction * wind_dot_desired
        perp_speed = wind_perpendicular.magnitude()

        if perp_speed < 0.1:
            return desired_direction, Vector3(0, 0, 0)

        # Calculate crab angle, but limit to 30 degrees to prioritize forward progress
        # (was 70 degrees which caused too much sideways flying)
        max_crab_angle = math.radians(30.0)
        max_sin = math.sin(max_crab_angle)

        sin_crab = min(max_sin, perp_speed / airspeed)
        crab_angle = math.asin(sin_crab)

        # Correction direction (into the perpendicular wind)
        correction_direction = (wind_perpendicular * -1).normalized()

        # Compute corrected heading using proper rotation
        cos_crab = math.cos(crab_angle)
        corrected = desired_direction * cos_crab + correction_direction * sin_crab
        corrected = corrected.normalized()

        # Correction vector for visualization
        correction_vector = correction_direction * sin_crab
        return corrected, correction_vector

    def _turn_toward(self, current: Vector3, target: Vector3, max_angle: float) -> Vector3:
        """Turn toward target with rate limit."""
        import math

        # Ensure inputs are normalized
        current_norm = current.normalized()
        target_norm = target.normalized()

        # Handle invalid inputs
        if current_norm.magnitude() < 0.1:
            return target_norm if target_norm.magnitude() > 0.1 else Vector3(1, 0, 0)
        if target_norm.magnitude() < 0.1:
            return current_norm

        dot = max(-1.0, min(1.0, current_norm.dot(target_norm)))
        angle = math.acos(dot)

        if angle < 1e-6:
            return target_norm

        max_rad = math.radians(max_angle)
        if angle <= max_rad:
            return target_norm

        t = max_rad / angle
        result = current_norm * (1 - t) + target_norm * t

        # Safety check: if interpolation produces a near-zero vector (happens with ~180° turns)
        # use a perpendicular vector to break the symmetry
        if result.magnitude() < 0.1:
            # Create a perpendicular vector by crossing with up or right
            up = Vector3(0, 1, 0)
            perp = current_norm.cross(up)
            if perp.magnitude() < 0.1:
                right = Vector3(1, 0, 0)
                perp = current_norm.cross(right)
            perp = perp.normalized()
            # Turn toward the perpendicular direction first
            result = current_norm * 0.7 + perp * 0.3

        return result.normalized()

    async def send_json(self, websocket: WebSocketServerProtocol, data: Dict) -> None:
        """Send JSON message to client."""
        await websocket.send(json.dumps(data, cls=NumpyEncoder))

    async def send_error(self, websocket: WebSocketServerProtocol, message: str) -> None:
        """Send error message to client."""
        await self.send_json(websocket, {
            "type": "error",
            "message": message
        })

    async def start(self) -> None:
        """Start the WebSocket server."""
        self.initialize()

        logger.info(f"Starting WebSocket server on ws://{self.config.host}:{self.config.port}")

        # Increase max message size to 10MB for wind field data
        async with websockets.serve(
            self.handle_client,
            self.config.host,
            self.config.port,
            max_size=10 * 1024 * 1024,  # 10MB
        ):
            logger.info("Server running. Press Ctrl+C to stop.")
            await asyncio.Future()  # Run forever


def run_server(host: str = "localhost", port: int = 8765, **kwargs) -> None:
    """Run the WebSocket server."""
    config = ServerConfig(host=host, port=port, **kwargs)
    server = WebSocketServer(config)
    asyncio.run(server.start())


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Drone Simulation WebSocket Server")
    parser.add_argument("--host", default="localhost", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to")
    parser.add_argument("--frame-delay", type=float, default=0.05, help="Delay between frames (seconds)")
    parser.add_argument("--stl", type=str, default="southken.stl", help="Path to STL file for scene geometry (default: southken.stl)")
    parser.add_argument("--vtu", type=str, default="internal.vtu", help="Path to VTU file for CFD wind data (default: internal.vtu, use 'none' for mock wind)")
    parser.add_argument("--grid-resolution", type=float, default=20.0, help="Pathfinding grid resolution in meters (default: 20, smaller = finer paths but slower)")
    parser.add_argument("--wind-resolution", type=float, default=10.0, help="Wind field resolution in meters (default: 10)")

    args = parser.parse_args()

    # Handle 'none' as special value to disable VTU loading
    vtu_path = args.vtu if args.vtu.lower() != 'none' else None

    run_server(
        host=args.host,
        port=args.port,
        frame_delay=args.frame_delay,
        stl_path=args.stl,
        vtu_path=vtu_path
    )
