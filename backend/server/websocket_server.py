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
from ..data.building_geometry import BuildingCollection
from ..data.mock_generator import MockDataGenerator
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
    """Server configuration."""
    host: str = "localhost"
    port: int = 8765

    # Scene configuration
    bounds_min: tuple = (0, 0, 0)
    bounds_max: tuple = (200, 200, 80)
    grid_resolution: float = 10.0
    wind_resolution: float = 5.0
    base_wind: tuple = (8.0, 2.0, 0.0)
    num_buildings: int = 4
    random_seed: int = 42

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
        self.buildings: Optional[BuildingCollection] = None
        self.wind_field: Optional[WindField] = None
        self.grid: Optional[Grid3D] = None
        self.wind_router: Optional[DijkstraRouter] = None
        self.naive_router: Optional[NaiveRouter] = None
        self.smoother: Optional[PathSmoother] = None
        self.metrics_calc: Optional[MetricsCalculator] = None
        self.flight_sim: Optional[FlightSimulator] = None
        self._initialized = False

    def initialize(self) -> None:
        """Initialize scene data and routing infrastructure."""
        if self._initialized:
            return

        logger.info("Initializing server...")

        bounds_min = Vector3(*self.config.bounds_min)
        bounds_max = Vector3(*self.config.bounds_max)

        # Generate mock data
        logger.info("Generating mock data...")
        gen = MockDataGenerator(seed=self.config.random_seed)

        self.buildings = gen.generate_buildings(
            bounds_min, bounds_max,
            num_buildings=self.config.num_buildings
        )
        logger.info(f"Created {len(self.buildings)} buildings")

        self.wind_field = gen.generate_wind_field(
            bounds_min, bounds_max,
            self.buildings,
            resolution=self.config.wind_resolution,
            base_wind=self.config.base_wind
        )
        logger.info(f"Created wind field: {self.wind_field.nx}x{self.wind_field.ny}x{self.wind_field.nz}")

        # Create grid
        logger.info("Creating grid...")
        self.grid = Grid3D(bounds_min, bounds_max, resolution=self.config.grid_resolution)
        logger.info(f"Grid: {self.grid.nx}x{self.grid.ny}x{self.grid.nz} = {self.grid.total_nodes} nodes")

        # Setup routers
        logger.info("Setting up routers...")

        calc = CostCalculator(self.wind_field, WeightConfig.speed_priority())
        calc.precompute_edge_costs(self.grid, self.buildings)
        logger.info(f"Computed {calc.edge_count} wind-aware edges")

        self.wind_router = DijkstraRouter(self.grid, calc, capture_interval=50)

        self.naive_router = NaiveRouter(self.grid, capture_interval=50)
        self.naive_router.precompute_valid_edges(self.buildings)

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
            "wind_base_direction": list(self.config.base_wind),
            "buildings": [
                {
                    "id": b.id,
                    "min": b.min_corner.to_list(),
                    "max": b.max_corner.to_list(),
                }
                for b in self.buildings
            ],
            "wind_field_shape": [self.wind_field.nx, self.wind_field.ny, self.wind_field.nz],
        }

    def get_wind_field_data(self, downsample: int = 1, precision: int = 2) -> Dict[str, Any]:
        """
        Get full wind field data for client to render streamlines.

        Args:
            downsample: Take every Nth sample (1 = full resolution, 2 = half, etc.)
            precision: Decimal places for rounding (reduces JSON size)

        Returns wind vectors and turbulence for every cell in the grid.
        """
        wf = self.wind_field

        # Optionally downsample for visualization
        if downsample > 1:
            wind_data = wf.wind_data[::downsample, ::downsample, ::downsample]
            turb_data = wf.turbulence_data[::downsample, ::downsample, ::downsample]
            shape = list(wind_data.shape[:3])
            resolution = self.config.wind_resolution * downsample
        else:
            wind_data = wf.wind_data
            turb_data = wf.turbulence_data
            shape = [wf.nx, wf.ny, wf.nz]
            resolution = self.config.wind_resolution

        # Round to reduce precision and JSON size
        wind_flat = np.round(wind_data.reshape(-1, 3), precision).tolist()
        turb_flat = np.round(turb_data.flatten(), precision + 1).tolist()

        return {
            "bounds": {
                "min": list(self.config.bounds_min),
                "max": list(self.config.bounds_max),
            },
            "resolution": resolution,
            "shape": shape,
            "downsample": downsample,
            # Flatten wind data to list of [vx, vy, vz] for each cell
            # Order: x varies fastest, then y, then z (C-order)
            "wind_vectors": wind_flat,
            "turbulence": turb_flat,
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
            # Send full wind field data for streamline rendering
            # Optional: downsample=2 takes every 2nd sample (reduces data by 8x)
            downsample = data.get("downsample", 1)
            logger.info(f"Sending wind field data (downsample={downsample})...")
            await self.send_json(websocket, {
                "type": "wind_field",
                "data": self.get_wind_field_data(downsample=downsample)
            })
            logger.info("Wind field data sent")

        elif msg_type == "get_all":
            # Send both scene and wind field in one response
            downsample = data.get("downsample", 1)
            logger.info(f"Sending full scene data with wind field (downsample={downsample})...")
            scene_data = self.get_scene_info()
            scene_data["wind_field"] = self.get_wind_field_data(downsample=downsample)
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

        # Run simulations and stream frames
        all_metrics = {}

        for route_name, path in routes_to_run:
            logger.info(f"Simulating {route_name} route...")

            await self.send_json(websocket, {
                "type": "simulation_start",
                "route": route_name,
                "waypoint_count": len(path)
            })

            # Run simulation and stream frames
            flight_data = await self.stream_simulation(websocket, route_name, path)

            # Calculate metrics
            metrics = self.metrics_calc.calculate(path)
            all_metrics[route_name] = metrics.to_dict()

            await self.send_json(websocket, {
                "type": "simulation_end",
                "route": route_name,
                "flight_summary": flight_data.to_dict()["summary"],
                "metrics": metrics.to_dict()
            })

        # Send completion with comparison
        await self.send_json(websocket, {
            "type": "complete",
            "metrics": all_metrics
        })

        logger.info("Simulation complete")

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
        from ..simulation.flight_simulator import DroneState, FlightFrame

        if len(path) < 2:
            return

        # Initialize state
        state = DroneState(
            position=Vector3(path[0].x, path[0].y, path[0].z),
            velocity=Vector3(0, 0, 0),
            heading=self._direction_to(path[0], path[1]),
            airspeed=sim_params.max_airspeed,
            target_waypoint_index=1
        )

        time = 0.0
        step = 0
        frames = []

        while time < sim_params.max_time:
            if state.target_waypoint_index >= len(path):
                break

            target = path[state.target_waypoint_index]
            wind = self.wind_field.get_wind_at(state.position)

            to_target = target - state.position
            distance_to_target = to_target.magnitude()

            if distance_to_target < sim_params.waypoint_threshold:
                state.target_waypoint_index += 1
                continue

            desired_direction = to_target.normalized()

            # Compute corrected heading
            heading, correction = self._compute_corrected_heading(
                desired_direction, wind, state.airspeed
            )

            # Update heading with turn rate limit
            state.heading = self._turn_toward(
                state.heading, heading,
                sim_params.max_turn_rate * sim_params.timestep
            )

            # Compute velocities
            air_velocity = state.heading * state.airspeed
            ground_velocity = air_velocity + wind
            groundspeed = ground_velocity.magnitude()

            # Compute drift
            if groundspeed > 0.1:
                drift = wind - (wind.dot(desired_direction) * desired_direction)
            else:
                drift = Vector3(0, 0, 0)

            # Compute effort
            headwind = max(0, -wind.dot(state.heading))
            effort = min(1.0, 0.1 + headwind * 0.05 + correction.magnitude() * 0.5)

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

            # Send frame to client
            await self.send_json(websocket, {
                "type": "frame",
                "route": route_name,
                "data": frame.to_dict()
            })

            # Delay for real-time effect
            await asyncio.sleep(self.config.frame_delay)

            # Update position
            state.position = state.position + ground_velocity * sim_params.timestep
            state.velocity = ground_velocity

            time += sim_params.timestep
            step += 1

        # Return flight data for summary
        from ..simulation.flight_simulator import FlightData

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

    def _direction_to(self, from_pos: Vector3, to_pos: Vector3) -> Vector3:
        """Compute unit direction vector."""
        diff = to_pos - from_pos
        mag = diff.magnitude()
        if mag < 1e-6:
            return Vector3(1, 0, 0)
        return diff / mag

    def _compute_corrected_heading(self, desired_direction: Vector3, wind: Vector3, airspeed: float):
        """Compute heading with wind correction."""
        import math

        wind_speed = wind.magnitude()
        if wind_speed < 0.1:
            return desired_direction, Vector3(0, 0, 0)

        wind_perpendicular = wind - desired_direction * wind.dot(desired_direction)
        perp_speed = wind_perpendicular.magnitude()

        if perp_speed < 0.1:
            return desired_direction, Vector3(0, 0, 0)

        sin_angle = min(1.0, perp_speed / airspeed)
        correction_direction = (wind_perpendicular * -1).normalized()
        correction_factor = sin_angle

        corrected = desired_direction + correction_direction * correction_factor
        corrected = corrected.normalized()

        correction_vector = correction_direction * correction_factor
        return corrected, correction_vector

    def _turn_toward(self, current: Vector3, target: Vector3, max_angle: float) -> Vector3:
        """Turn toward target with rate limit."""
        import math

        dot = max(-1.0, min(1.0, current.dot(target)))
        angle = math.acos(dot)

        if angle < 1e-6:
            return target

        max_rad = math.radians(max_angle)
        if angle <= max_rad:
            return target

        t = max_rad / angle
        result = current * (1 - t) + target * t
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

    args = parser.parse_args()

    run_server(host=args.host, port=args.port, frame_delay=args.frame_delay)
