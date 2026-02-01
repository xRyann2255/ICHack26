#!/usr/bin/env python3
"""Test STL loading and routing with collision detection."""

import os
import sys
import time

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.data.stl_loader import STLLoader, MeshCollisionChecker
from backend.data.mock_generator import MockDataGenerator
from backend.grid.node import Vector3
from backend.grid.grid_3d import Grid3D


def test_stl_loading():
    """Test basic STL loading."""
    stl_path = "southken.stl"

    if not os.path.exists(stl_path):
        print(f"STL file not found: {stl_path}")
        return None

    print(f"Loading {stl_path}...")
    mesh = STLLoader.load_stl(stl_path, center_xy=True, ground_at_zero=True)

    print(f"\nMesh bounds (Y-up coordinates):")
    print(f"  Min: {mesh.min_bounds}")
    print(f"  Max: {mesh.max_bounds}")
    print(f"  Size: {mesh.max_bounds - mesh.min_bounds}")

    print(f"\nSpatial grid info:")
    print(f"  Cell size: {mesh.cell_size}")
    print(f"  Num cells with triangles: {len(mesh.spatial_grid)}")

    return mesh


def test_collision_detection(mesh):
    """Test collision detection with the mesh."""
    print("\n" + "="*60)
    print("Testing collision detection")
    print("="*60)

    checker = MeshCollisionChecker(mesh)

    # Test points at different positions
    test_points = [
        Vector3(0, 50, 0),    # High in the air at center - should be clear
        Vector3(0, 10, 0),    # Lower, might hit buildings
        Vector3(0, 0, 0),     # Ground level at center
        Vector3(-400, 50, -600),  # Outside mesh bounds
    ]

    print("\nPoint-in-mesh tests:")
    for point in test_points:
        inside = checker.point_in_building(point)
        print(f"  {point}: {'INSIDE' if inside else 'outside'}")

    # Test segments
    test_segments = [
        (Vector3(-400, 80, -400), Vector3(400, 80, 400)),  # High diagonal - should be clear
        (Vector3(-400, 20, -400), Vector3(400, 20, 400)),  # Low diagonal - might hit
        (Vector3(0, 0, 0), Vector3(0, 100, 0)),            # Straight up from center
        (Vector3(-400, 50, 0), Vector3(400, 50, 0)),       # Horizontal through center
    ]

    print("\nSegment intersection tests:")
    for start, end in test_segments:
        t0 = time.time()
        intersects = checker.edge_intersects_building(start, end)
        t1 = time.time()
        print(f"  {start} -> {end}")
        print(f"    {'INTERSECTS' if intersects else 'clear'} ({(t1-t0)*1000:.2f}ms)")


def test_wind_generation(mesh):
    """Test wind field generation around the mesh."""
    print("\n" + "="*60)
    print("Testing wind field generation")
    print("="*60)

    gen = MockDataGenerator(seed=42)

    # Get bounds from mesh
    bounds_min = Vector3(
        mesh.min_bounds[0] - 50,
        0,
        mesh.min_bounds[2] - 50
    )
    bounds_max = Vector3(
        mesh.max_bounds[0] + 50,
        mesh.max_bounds[1] + 50,
        mesh.max_bounds[2] + 50
    )

    print(f"\nScene bounds: {bounds_min} to {bounds_max}")

    t0 = time.time()
    wind_field = gen._generate_wind_field_for_mesh(
        bounds_min, bounds_max, mesh,
        resolution=20.0,  # Coarse for speed
        base_wind=(8.0, 0.0, 3.0)
    )
    t1 = time.time()

    print(f"Wind field generated in {t1-t0:.2f}s")
    # print(f"  Shape: {wind_field.nx}x{wind_field.ny}x{wind_field.nz}")

    # Sample some wind values
    test_positions = [
        Vector3(0, 80, 0),    # High above center
        Vector3(0, 20, 0),    # Low at center
        Vector3(-400, 50, -400),  # Corner
    ]

    print("\nWind samples:")
    for pos in test_positions:
        wind = wind_field.get_wind_at(pos)
        turb = wind_field.get_turbulence_at(pos)
        print(f"  {pos}: wind={wind}, turb={turb:.2f}")

    return wind_field


def test_pathfinding_with_mesh(mesh, wind_field):
    """Test pathfinding with mesh collision detection."""
    print("\n" + "="*60)
    print("Testing pathfinding with mesh collision")
    print("="*60)

    from backend.routing.cost_calculator import CostCalculator, WeightConfig
    from backend.routing.dijkstra import DijkstraRouter
    from backend.routing.naive_router import NaiveRouter

    # Create grid covering the scene
    bounds_min = Vector3(
        mesh.min_bounds[0] - 50,
        0,
        mesh.min_bounds[2] - 50
    )
    bounds_max = Vector3(
        mesh.max_bounds[0] + 50,
        mesh.max_bounds[1] + 50,
        mesh.max_bounds[2] + 50
    )

    print(f"\nCreating grid...")
    grid = Grid3D(bounds_min, bounds_max, resolution=20.0)  # Coarse for speed
    print(f"  Grid: {grid.nx}x{grid.ny}x{grid.nz} = {grid.total_nodes} nodes")

    # Pre-compute edge costs
    print("\nPre-computing edge costs (this may take a moment)...")
    weights = WeightConfig.speed_priority()
    calc = CostCalculator(wind_field, weights)

    t0 = time.time()
    calc.precompute_edge_costs(grid, mesh=mesh)
    t1 = time.time()
    print(f"  Computed {calc.edge_count} edges in {t1-t0:.2f}s")

    # Setup routers
    wind_router = DijkstraRouter(grid, calc)

    naive_router = NaiveRouter(grid)
    naive_router.precompute_valid_edges(mesh=mesh)

    # Test a route
    start = Vector3(-400, 60, -400)  # Corner, above buildings
    end = Vector3(400, 60, 400)      # Opposite corner

    print(f"\nFinding path from {start} to {end}...")

    t0 = time.time()
    naive_result = naive_router.find_path(start, end, capture_exploration=False)
    t1 = time.time()
    print(f"\nNaive route:")
    print(f"  Success: {naive_result.success}")
    if naive_result.success:
        print(f"  Path length: {len(naive_result.path)} waypoints")
        print(f"  Total cost (distance): {naive_result.total_cost:.1f}m")
    print(f"  Time: {(t1-t0)*1000:.1f}ms")

    t0 = time.time()
    wind_result = wind_router.find_path(start, end, capture_exploration=False)
    t1 = time.time()
    print(f"\nWind-aware route:")
    print(f"  Success: {wind_result.success}")
    if wind_result.success:
        print(f"  Path length: {len(wind_result.path)} waypoints")
        print(f"  Total cost: {wind_result.total_cost:.1f}")
    print(f"  Time: {(t1-t0)*1000:.1f}ms")

    return naive_result, wind_result


def main():
    # Test STL loading
    mesh = test_stl_loading()
    if mesh is None:
        return

    # Test collision detection
    test_collision_detection(mesh)

    # Test wind field generation
    wind_field = test_wind_generation(mesh)

    # Test pathfinding
    test_pathfinding_with_mesh(mesh, wind_field)

    print("\n" + "="*60)
    print("All tests completed!")
    print("="*60)


if __name__ == "__main__":
    main()
