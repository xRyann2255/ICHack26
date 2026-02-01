#!/usr/bin/env python3


import argparse
import os
import time
from typing import List, Optional

from .grid.node import Vector3
from .grid.grid_3d import Grid3D
from .data.wind_field import WindField
from .data.building_geometry import BuildingCollection
from .data.stl_loader import STLLoader, STLMesh
from .data.vtu_loader import VTULoader
from .routing.cost_calculator import CostCalculator, WeightConfig
from .routing.dijkstra import DijkstraRouter
from .routing.naive_router import NaiveRouter
from .routing.path_smoother import PathSmoother
from .metrics.calculator import MetricsCalculator
from .output.serializer import RouteSerializer, ScenarioData
from .config import DemoConfig, ScenarioConfig, PRESETS


def print_header(text: str) -> None:
    """Print a section header."""
    print()
    print("=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_step(text: str) -> None:
    """Print a step indicator."""
    print(f"\n>> {text}")


def load_stl_scene(
    stl_path: str,
    vtu_path: str,
    config: DemoConfig,
) -> tuple:
    """
    Load scene from STL and VTU files.

    Args:
        stl_path: Path to STL file
        vtu_path: Path to VTU file with CFD wind data
        config: Demo configuration

    Returns:
        Tuple of (mesh, wind_field, bounds_min, bounds_max)
    """
    print_step(f"Loading STL: {stl_path}")
    mesh = STLLoader.load_stl(stl_path, convert_coords=True, center_xy=True, ground_at_zero=True)

    # Calculate scene bounds
    margin = 50.0
    flight_ceiling = 50.0
    bounds_min = Vector3(
        mesh.min_bounds[0] - margin,
        0,
        mesh.min_bounds[2] - margin
    )
    bounds_max = Vector3(
        mesh.max_bounds[0] + margin,
        mesh.max_bounds[1] + flight_ceiling,
        mesh.max_bounds[2] + margin
    )

    print_step(f"Loading VTU wind data: {vtu_path}")
    wind_field = VTULoader.load_and_normalize(
        vtu_path,
        scene_bounds_min=bounds_min,
        scene_bounds_max=bounds_max,
        resolution=config.wind.field_resolution
    )

    return mesh, wind_field, bounds_min, bounds_max


def setup_routers(
    config: DemoConfig,
    buildings: BuildingCollection,
    wind_field: WindField,
    mesh: Optional[STLMesh] = None,
    bounds_min: Optional[Vector3] = None,
    bounds_max: Optional[Vector3] = None
) -> tuple:
    """
    Set up the routing infrastructure.

    Args:
        config: Demo configuration
        buildings: Building collection for collision (used if mesh is None)
        wind_field: Wind field data
        mesh: Optional STL mesh for collision (takes precedence over buildings)
        bounds_min: Optional scene bounds (overrides config if provided)
        bounds_max: Optional scene bounds (overrides config if provided)

    Returns:
        Tuple of (grid, wind_router, naive_router, smoother, metrics_calc)
    """
    print_step("Setting up routing infrastructure...")

    if bounds_min is None:
        bounds_min = Vector3(*config.scene.bounds_min)
    if bounds_max is None:
        bounds_max = Vector3(*config.scene.bounds_max)

    # Create grid
    print(f"   Creating grid (resolution={config.scene.grid_resolution}m)...")
    grid = Grid3D(bounds_min, bounds_max, resolution=config.scene.grid_resolution)
    print(f"   Grid: {grid.nx}x{grid.ny}x{grid.nz} = {grid.total_nodes} nodes")

    # Get weight config (efficiency focused: distance + headwind only)
    weight_presets = {
        "speed_priority": WeightConfig.speed_priority,
        "balanced": WeightConfig.balanced,
        "distance_only": WeightConfig.distance_only,
        "wind_optimized": WeightConfig.wind_optimized,
    }
    weight_func = weight_presets.get(config.routing.weight_preset, WeightConfig.speed_priority)
    weights = weight_func()
    print(f"   Weight preset: {config.routing.weight_preset}")

    # Setup wind-aware router
    print("   Pre-computing wind-aware edge costs...")
    start_time = time.time()
    calc = CostCalculator(wind_field, weights)
    if mesh:
        print("   Using STL mesh for collision detection...")
        calc.precompute_edge_costs(grid, mesh=mesh)
    else:
        calc.precompute_edge_costs(grid, buildings=buildings)
    elapsed = time.time() - start_time
    print(f"   Computed {calc.edge_count} edges in {elapsed:.2f}s")

    wind_router = DijkstraRouter(grid, calc, capture_interval=config.routing.capture_interval)

    # Setup naive router
    print("   Setting up naive router...")
    naive_router = NaiveRouter(grid, capture_interval=config.routing.capture_interval)
    if mesh:
        naive_router.precompute_valid_edges(mesh=mesh)
    else:
        naive_router.precompute_valid_edges(buildings=buildings)

    # Setup other components
    smoother = PathSmoother(points_per_segment=config.routing.path_smoothing_points)
    metrics_calc = MetricsCalculator(wind_field)

    return grid, wind_router, naive_router, smoother, metrics_calc


def run_scenario(
    scenario: ScenarioConfig,
    wind_router: DijkstraRouter,
    naive_router: NaiveRouter,
    smoother: PathSmoother,
    metrics_calc: MetricsCalculator,
    serializer: RouteSerializer
) -> Optional[ScenarioData]:
    """
    Run a single routing scenario.

    Returns:
        ScenarioData or None if pathfinding failed
    """
    start = Vector3(*scenario.start)
    end = Vector3(*scenario.end)
    name = scenario.name or f"scenario"

    print(f"\n   [{name}] {scenario.start} -> {scenario.end}")

    # Find paths
    naive_result = naive_router.find_path(start, end)
    wind_result = wind_router.find_path(start, end)

    if not naive_result.success or not wind_result.success:
        print(f"   [{name}] FAILED - no path found")
        return None

    # Smooth paths
    naive_smooth = smoother.smooth(naive_result.path)
    wind_smooth = smoother.smooth(wind_result.path)

    # Calculate metrics
    naive_metrics = metrics_calc.calculate(naive_smooth)
    wind_metrics = metrics_calc.calculate(wind_smooth)

    # Print comparison
    print(f"   [{name}] Naive:     {naive_metrics.summary()}")
    print(f"   [{name}] Optimized: {wind_metrics.summary()}")

    time_improvement = naive_metrics.total_flight_time / max(0.1, wind_metrics.total_flight_time)
    energy_improvement = naive_metrics.energy_consumption / max(0.001, wind_metrics.energy_consumption)
    print(f"   [{name}] Improvement: {time_improvement:.1f}x faster, {energy_improvement:.1f}x more efficient")

    # Serialize
    naive_route = serializer.serialize_path_result(
        naive_result, naive_smooth, naive_metrics, 'naive'
    )
    wind_route = serializer.serialize_path_result(
        wind_result, wind_smooth, wind_metrics, 'optimized'
    )

    return serializer.serialize_scenario(
        scenario_id=name,
        start=start,
        end=end,
        naive_route=naive_route,
        optimized_route=wind_route
    )


def run_all_scenarios(
    config: DemoConfig,
    buildings: BuildingCollection,
    wind_field: WindField,
    output_path: str,
    mesh: Optional[STLMesh] = None,
    bounds_min: Optional[Vector3] = None,
    bounds_max: Optional[Vector3] = None
) -> None:
    """Run all scenarios and save output."""
    print_step("Running scenarios...")

    # Setup infrastructure
    grid, wind_router, naive_router, smoother, metrics_calc = setup_routers(
        config, buildings, wind_field,
        mesh=mesh, bounds_min=bounds_min, bounds_max=bounds_max
    )

    serializer = RouteSerializer()
    scenarios: List[ScenarioData] = []

    # Run each scenario
    print_step(f"Processing {len(config.scenarios)} scenarios...")
    for scenario_config in config.scenarios:
        result = run_scenario(
            scenario_config,
            wind_router, naive_router,
            smoother, metrics_calc, serializer
        )
        if result:
            scenarios.append(result)

    # Create output
    print_step("Creating output...")

    # Use provided bounds or fall back to config
    if bounds_min is None:
        bounds_min = Vector3(*config.scene.bounds_min)
    if bounds_max is None:
        bounds_max = Vector3(*config.scene.bounds_max)

    demo_output = serializer.create_demo_output(
        bounds_min=bounds_min,
        bounds_max=bounds_max,
        grid_resolution=config.scene.grid_resolution,
        wind_base_direction=list(config.wind.base_wind),
        scenarios=scenarios,
        buildings=buildings,
        wind_field=wind_field,
        wind_field_file="wind_field.npz"
    )

    # Save output
    print_step("Saving output...")
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    serializer.save_json(demo_output, output_path, indent=2)
    file_size = os.path.getsize(output_path)
    print(f"   Saved: {output_path} ({file_size:,} bytes)")

    # Also save compact version
    compact_path = output_path.replace(".json", "_compact.json")
    serializer.save_json(demo_output, compact_path, indent=None, compact_arrays=True)
    compact_size = os.path.getsize(compact_path)
    print(f"   Saved: {compact_path} ({compact_size:,} bytes)")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Wind-Aware Drone Routing System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:

  Run routing:
    python -m backend.main --stl southken.stl --vtu internal.vtu --output routes.json

Presets: demo, small, large
        """
    )

    parser.add_argument(
        "--stl",
        type=str,
        default="southken.stl",
        help="Path to STL file for scene geometry"
    )

    parser.add_argument(
        "--vtu",
        type=str,
        default="internal.vtu",
        help="Path to VTU file for CFD wind data"
    )

    parser.add_argument(
        "--preset",
        choices=list(PRESETS.keys()),
        default="small",
        help="Configuration preset (default: small)"
    )

    parser.add_argument(
        "--output",
        default="data/output/demo_routes.json",
        help="Output JSON file (default: data/output/demo_routes.json)"
    )

    parser.add_argument(
        "--weights",
        choices=["speed_priority", "balanced", "wind_optimized"],
        default="speed_priority",
        help="Weight preset for routing (default: speed_priority)"
    )

    args = parser.parse_args()

    # Get configuration
    config = PRESETS[args.preset]
    config.routing.weight_preset = args.weights

    print_header("Wind-Aware Drone Routing")
    print(f"Preset: {args.preset}")

    start_time = time.time()

    # Load scene
    print_header("Loading Scene")
    mesh, wind_field, bounds_min, bounds_max = load_stl_scene(
        args.stl, args.vtu, config
    )
    buildings = BuildingCollection([])  # Mesh handles collision

    # Run scenarios
    print_header("Running Pathfinding")
    run_all_scenarios(
        config, buildings, wind_field, args.output,
        mesh=mesh, bounds_min=bounds_min, bounds_max=bounds_max
    )

    # Done
    elapsed = time.time() - start_time
    print_header("Complete")
    print(f"Total time: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
