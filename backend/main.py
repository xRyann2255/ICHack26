#!/usr/bin/env python3
"""
Wind-Aware Drone Routing - Main Entry Point

CLI tool for generating mock data and computing optimized drone routes.

Usage:
    python -m backend.main --generate-mock --preset small
    python -m backend.main --run --preset demo --output data/output/demo.json
    python -m backend.main --generate-mock --run --preset small
"""

import argparse
import os
import sys
import time
from typing import List, Optional

from .grid.node import Vector3
from .grid.grid_3d import Grid3D
from .data.mock_generator import MockDataGenerator
from .data.wind_field import WindField
from .data.building_geometry import BuildingCollection
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


def generate_mock_data(config: DemoConfig) -> tuple:
    """
    Generate mock wind and building data.

    Returns:
        Tuple of (buildings, wind_field)
    """
    print_step("Generating mock data...")

    gen = MockDataGenerator(seed=config.random_seed)

    bounds_min = Vector3(*config.scene.bounds_min)
    bounds_max = Vector3(*config.scene.bounds_max)

    # Generate buildings
    print(f"   Creating {config.buildings.num_buildings} buildings...")
    buildings = gen.generate_buildings(
        bounds_min, bounds_max,
        num_buildings=config.buildings.num_buildings,
        min_size=config.buildings.min_size,
        max_size=config.buildings.max_size,
        margin=config.buildings.margin
    )
    print(f"   Created {len(buildings)} buildings")

    # Generate wind field
    print(f"   Generating wind field (resolution={config.wind.field_resolution}m)...")
    wind_field = gen.generate_wind_field(
        bounds_min, bounds_max,
        buildings,
        resolution=config.wind.field_resolution,
        base_wind=config.wind.base_wind,
        altitude_factor=config.wind.altitude_factor
    )
    print(f"   Wind field: {wind_field.nx}x{wind_field.ny}x{wind_field.nz}")

    return buildings, wind_field


def save_mock_data(
    buildings: BuildingCollection,
    wind_field: WindField,
    output_dir: str
) -> None:
    """Save mock data to files."""
    print_step("Saving mock data...")

    os.makedirs(output_dir, exist_ok=True)

    buildings_path = os.path.join(output_dir, "buildings.json")
    wind_path = os.path.join(output_dir, "wind_field.npz")

    buildings.save_json(buildings_path)
    print(f"   Saved: {buildings_path}")

    wind_field.save_npz(wind_path)
    print(f"   Saved: {wind_path}")


def load_mock_data(input_dir: str) -> tuple:
    """Load mock data from files."""
    print_step("Loading mock data...")

    buildings_path = os.path.join(input_dir, "buildings.json")
    wind_path = os.path.join(input_dir, "wind_field.npz")

    buildings = BuildingCollection.load_json(buildings_path)
    print(f"   Loaded {len(buildings)} buildings from {buildings_path}")

    wind_field = WindField.load_npz(wind_path)
    print(f"   Loaded wind field {wind_field.nx}x{wind_field.ny}x{wind_field.nz} from {wind_path}")

    return buildings, wind_field


def setup_routers(
    config: DemoConfig,
    buildings: BuildingCollection,
    wind_field: WindField
) -> tuple:
    """
    Set up the routing infrastructure.

    Returns:
        Tuple of (grid, wind_router, naive_router, smoother, metrics_calc)
    """
    print_step("Setting up routing infrastructure...")

    bounds_min = Vector3(*config.scene.bounds_min)
    bounds_max = Vector3(*config.scene.bounds_max)

    # Create grid
    print(f"   Creating grid (resolution={config.scene.grid_resolution}m)...")
    grid = Grid3D(bounds_min, bounds_max, resolution=config.scene.grid_resolution)
    print(f"   Grid: {grid.nx}x{grid.ny}x{grid.nz} = {grid.total_nodes} nodes")

    # Get weight config
    weight_presets = {
        "speed_priority": WeightConfig.speed_priority,
        "safety_priority": WeightConfig.safety_priority,
        "balanced": WeightConfig.balanced,
        "distance_only": WeightConfig.distance_only,
    }
    weight_func = weight_presets.get(config.routing.weight_preset, WeightConfig.speed_priority)
    weights = weight_func()
    print(f"   Weight preset: {config.routing.weight_preset}")

    # Setup wind-aware router
    print("   Pre-computing wind-aware edge costs...")
    start_time = time.time()
    calc = CostCalculator(wind_field, weights)
    calc.precompute_edge_costs(grid, buildings)
    elapsed = time.time() - start_time
    print(f"   Computed {calc.edge_count} edges in {elapsed:.2f}s")

    wind_router = DijkstraRouter(grid, calc, capture_interval=config.routing.capture_interval)

    # Setup naive router
    print("   Setting up naive router...")
    naive_router = NaiveRouter(grid, capture_interval=config.routing.capture_interval)
    naive_router.precompute_valid_edges(buildings)

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
    output_path: str
) -> None:
    """Run all scenarios and save output."""
    print_step("Running scenarios...")

    # Setup infrastructure
    grid, wind_router, naive_router, smoother, metrics_calc = setup_routers(
        config, buildings, wind_field
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

    bounds_min = Vector3(*config.scene.bounds_min)
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
  Generate mock data:
    python -m backend.main --generate-mock --preset small

  Run routing on existing data:
    python -m backend.main --run --data-dir data/mock --output data/output/routes.json

  Generate and run in one step:
    python -m backend.main --generate-mock --run --preset demo

Presets: demo, small, large
        """
    )

    parser.add_argument(
        "--generate-mock",
        action="store_true",
        help="Generate mock wind and building data"
    )

    parser.add_argument(
        "--run",
        action="store_true",
        help="Run pathfinding on scenarios"
    )

    parser.add_argument(
        "--preset",
        choices=list(PRESETS.keys()),
        default="small",
        help="Configuration preset (default: small)"
    )

    parser.add_argument(
        "--data-dir",
        default="data/mock",
        help="Directory for mock data (default: data/mock)"
    )

    parser.add_argument(
        "--output",
        default="data/output/demo_routes.json",
        help="Output JSON file (default: data/output/demo_routes.json)"
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed (default: 42)"
    )

    parser.add_argument(
        "--weights",
        choices=["speed_priority", "safety_priority", "balanced"],
        default="speed_priority",
        help="Weight preset for routing (default: speed_priority)"
    )

    args = parser.parse_args()

    # Get configuration
    config = PRESETS[args.preset]
    config.random_seed = args.seed
    config.output_dir = args.data_dir
    config.routing.weight_preset = args.weights

    print_header("Wind-Aware Drone Routing")
    print(f"Preset: {args.preset}")
    print(f"Data directory: {args.data_dir}")

    # Validate arguments
    if not args.generate_mock and not args.run:
        print("\nError: Specify --generate-mock and/or --run")
        parser.print_help()
        sys.exit(1)

    start_time = time.time()

    # Generate mock data if requested
    if args.generate_mock:
        print_header("Generating Mock Data")
        buildings, wind_field = generate_mock_data(config)
        save_mock_data(buildings, wind_field, args.data_dir)

    # Run scenarios if requested
    if args.run:
        print_header("Running Pathfinding")

        # Load data if not just generated
        if args.generate_mock:
            # Already have the data
            pass
        else:
            buildings, wind_field = load_mock_data(args.data_dir)

        run_all_scenarios(config, buildings, wind_field, args.output)

    # Done
    elapsed = time.time() - start_time
    print_header("Complete")
    print(f"Total time: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
