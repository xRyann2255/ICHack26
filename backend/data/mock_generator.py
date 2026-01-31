"""Mock data generator for development and testing."""

from __future__ import annotations
import numpy as np
from typing import List, Tuple, Optional, Union
import os

from ..grid.node import Vector3
from .building_geometry import Building, BuildingCollection
from .wind_field import WindField
from .stl_loader import STLLoader, STLMesh, MeshCollisionChecker


class MockDataGenerator:
    """Generate mock CFD-like wind and building data for testing."""

    def __init__(self, seed: Optional[int] = None):
        """
        Initialize generator with optional random seed.

        Args:
            seed: Random seed for reproducibility
        """
        self.rng = np.random.default_rng(seed)

    def generate_buildings(
        self,
        bounds_min: Vector3,
        bounds_max: Vector3,
        num_buildings: int = 10,
        min_size: Tuple[float, float, float] = (20, 30, 20),
        max_size: Tuple[float, float, float] = (50, 100, 50),
        margin: float = 10.0
    ) -> BuildingCollection:
        """
        Generate random buildings within bounds.

        Coordinate system (Y-up):
        - X: width (east-west)
        - Y: height (vertical) - buildings start at y=0
        - Z: depth (north-south)

        Args:
            bounds_min: Minimum corner of the area
            bounds_max: Maximum corner of the area
            num_buildings: Number of buildings to generate
            min_size: Minimum (width, height, depth) of buildings
            max_size: Maximum (width, height, depth) of buildings
            margin: Minimum margin from bounds edges

        Returns:
            BuildingCollection with generated buildings
        """
        buildings = []
        attempts = 0
        max_attempts = num_buildings * 20

        while len(buildings) < num_buildings and attempts < max_attempts:
            attempts += 1

            # Random size (x=width, y=height, z=depth)
            width = self.rng.uniform(min_size[0], max_size[0])
            height = self.rng.uniform(min_size[1], max_size[1])
            depth = self.rng.uniform(min_size[2], max_size[2])

            # Random position (buildings start at ground level y=0)
            x = self.rng.uniform(bounds_min.x + margin, bounds_max.x - margin - width)
            z = self.rng.uniform(bounds_min.z + margin, bounds_max.z - margin - depth)

            min_corner = Vector3(x, 0, z)  # Y=0 is ground level
            max_corner = Vector3(x + width, height, z + depth)

            new_building = Building(min_corner, max_corner, f"building_{len(buildings)}")

            # Check for overlap with existing buildings
            overlap = False
            for existing in buildings:
                if self._buildings_overlap(new_building, existing, margin=5.0):
                    overlap = True
                    break

            if not overlap:
                buildings.append(new_building)

        return BuildingCollection(buildings)

    def _buildings_overlap(self, b1: Building, b2: Building, margin: float = 0) -> bool:
        """Check if two buildings overlap in the horizontal plane (with optional margin)."""
        # Check X and Z overlap (horizontal plane, Y is vertical)
        return not (
            b1.max_corner.x + margin < b2.min_corner.x or
            b2.max_corner.x + margin < b1.min_corner.x or
            b1.max_corner.z + margin < b2.min_corner.z or
            b2.max_corner.z + margin < b1.min_corner.z
        )

    def generate_wind_field(
        self,
        bounds_min: Vector3,
        bounds_max: Vector3,
        buildings: BuildingCollection,
        resolution: float = 5.0,
        base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0),
        altitude_factor: float = 0.005
    ) -> WindField:
        """
        Generate a mock wind field with realistic effects.

        Coordinate system (Y-up):
        - X: width, Z: depth (horizontal plane)
        - Y: altitude (vertical)
        - Wind vector is (vx, vy, vz) where vy is vertical component

        Args:
            bounds_min: Minimum corner of the volume
            bounds_max: Maximum corner of the volume
            buildings: Buildings that affect wind flow
            resolution: Grid cell size in meters
            base_wind: Base wind velocity (vx, vy, vz) at ground level
            altitude_factor: Wind speed increase per meter of altitude (Y axis)

        Returns:
            WindField with generated data
        """
        # Calculate grid dimensions
        size = bounds_max - bounds_min
        nx = max(2, int(size.x / resolution) + 1)
        ny = max(2, int(size.y / resolution) + 1)
        nz = max(2, int(size.z / resolution) + 1)

        # Initialize arrays
        wind_data = np.zeros((nx, ny, nz, 3), dtype=np.float32)
        turbulence_data = np.zeros((nx, ny, nz), dtype=np.float32)

        # Base wind vector
        base_wind_vec = np.array(base_wind, dtype=np.float32)
        # Horizontal component is X and Z (not Y which is vertical)
        base_wind_magnitude = np.linalg.norm([base_wind_vec[0], base_wind_vec[2]])

        # Generate wind for each cell
        for ix in range(nx):
            for iy in range(ny):
                for iz in range(nz):
                    # World position of this cell
                    pos = Vector3(
                        bounds_min.x + ix * resolution,
                        bounds_min.y + iy * resolution,
                        bounds_min.z + iz * resolution
                    )

                    # Start with base wind + altitude effect (Y is altitude)
                    altitude = pos.y
                    altitude_multiplier = 1.0 + altitude * altitude_factor
                    wind = base_wind_vec * altitude_multiplier

                    # Base turbulence (low)
                    turbulence = 0.05

                    # Apply building effects
                    for building in buildings:
                        wind, turbulence = self._apply_building_effect(
                            pos, building, wind, turbulence,
                            base_wind_vec, base_wind_magnitude
                        )

                    wind_data[ix, iy, iz] = wind
                    turbulence_data[ix, iy, iz] = min(1.0, turbulence)

        return WindField(wind_data, turbulence_data, bounds_min, bounds_max)

    def _apply_building_effect(
        self,
        pos: Vector3,
        building: Building,
        wind: np.ndarray,
        turbulence: float,
        base_wind_vec: np.ndarray,
        base_wind_magnitude: float
    ) -> Tuple[np.ndarray, float]:
        """
        Apply a single building's effect on wind at a position.

        Coordinate system (Y-up):
        - X, Z: horizontal plane
        - Y: vertical (altitude)

        Effects modeled:
        - Inside building: no wind
        - Wake zone (downwind): reduced wind, increased turbulence
        - Windward side: slight speed-up around edges
        - Near edges: increased turbulence
        """
        # Check if inside building
        if building.contains_point(pos):
            return np.zeros(3, dtype=np.float32), 0.0

        center = building.center
        size = building.size

        # Distance from building center
        dx = pos.x - center.x  # Horizontal (width)
        dy = pos.y - center.y  # Vertical (altitude)
        dz = pos.z - center.z  # Horizontal (depth)

        # Normalized wind direction (horizontal plane: X and Z)
        if base_wind_magnitude > 0.1:
            # Wind direction in XZ plane (index 0=X, index 2=Z)
            wind_dir = np.array([base_wind_vec[0], base_wind_vec[2]]) / base_wind_magnitude
        else:
            wind_dir = np.array([1.0, 0.0])

        # Project position onto wind direction (positive = downwind)
        # Using X and Z for horizontal plane
        downwind_dist = dx * wind_dir[0] + dz * wind_dir[1]

        # Cross-wind distance (perpendicular to wind in horizontal plane)
        crosswind_dist = abs(-dx * wind_dir[1] + dz * wind_dir[0])

        # Building half-sizes
        half_width = max(size.x, size.z) / 2  # Horizontal extent
        building_height = size.y  # Vertical extent (Y is up)

        # Check if in wake zone (behind building, within width, below top)
        wake_length = building_height * 3  # Wake extends ~3x building height downwind
        in_wake = (
            downwind_dist > half_width and
            downwind_dist < half_width + wake_length and
            crosswind_dist < half_width * 1.5 and
            pos.y < building_height * 1.2  # Y is altitude
        )

        if in_wake:
            # Reduce wind in wake, increase turbulence
            wake_factor = 1 - np.exp(-(downwind_dist - half_width) / (wake_length * 0.3))
            wind_reduction = 0.3 + 0.7 * wake_factor  # 30-100% of original
            wind = wind * wind_reduction
            turbulence = max(turbulence, 0.4 + 0.3 * (1 - wake_factor))

        # Check if near building edges (turbulence zone)
        dist_to_building = self._distance_to_building(pos, building)
        edge_zone = 15.0  # meters

        if dist_to_building < edge_zone and pos.y < building_height * 1.5:
            edge_factor = 1 - (dist_to_building / edge_zone)
            turbulence = max(turbulence, 0.2 + 0.5 * edge_factor)

            # Speed up around sides
            if crosswind_dist > half_width * 0.8 and abs(downwind_dist) < half_width:
                wind = wind * (1 + 0.3 * edge_factor)

        return wind, turbulence

    def _distance_to_building(self, pos: Vector3, building: Building) -> float:
        """Calculate minimum distance from a point to a building surface."""
        # Clamp point to building bounds
        closest = Vector3(
            max(building.min_corner.x, min(pos.x, building.max_corner.x)),
            max(building.min_corner.y, min(pos.y, building.max_corner.y)),
            max(building.min_corner.z, min(pos.z, building.max_corner.z))
        )
        return (pos - closest).magnitude()

    def generate_and_save(
        self,
        output_dir: str,
        bounds_min: Vector3 = Vector3(0, 0, 0),
        bounds_max: Vector3 = Vector3(500, 150, 500),  # (x, y_height, z_depth)
        num_buildings: int = 8,
        wind_resolution: float = 5.0,
        base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0)  # (vx, vy_vertical, vz)
    ) -> Tuple[BuildingCollection, WindField]:
        """
        Generate complete mock dataset and save to files.

        Args:
            output_dir: Directory to save files
            bounds_min: Minimum corner of the scene
            bounds_max: Maximum corner of the scene
            num_buildings: Number of buildings to generate
            wind_resolution: Wind field grid resolution
            base_wind: Base wind velocity

        Returns:
            Tuple of (BuildingCollection, WindField)
        """
        os.makedirs(output_dir, exist_ok=True)

        # Generate buildings
        print(f"Generating {num_buildings} buildings...")
        buildings = self.generate_buildings(
            bounds_min, bounds_max,
            num_buildings=num_buildings
        )
        print(f"  Created {len(buildings)} buildings")

        # Generate wind field
        print(f"Generating wind field (resolution={wind_resolution}m)...")
        wind_field = self.generate_wind_field(
            bounds_min, bounds_max,
            buildings,
            resolution=wind_resolution,
            base_wind=base_wind
        )
        print(f"  Grid size: {wind_field.nx}x{wind_field.ny}x{wind_field.nz}")

        # Save files
        buildings_path = os.path.join(output_dir, "buildings.json")
        wind_path = os.path.join(output_dir, "wind_field.npz")

        buildings.save_json(buildings_path)
        print(f"  Saved buildings to {buildings_path}")

        wind_field.save_npz(wind_path)
        print(f"  Saved wind field to {wind_path}")

        return buildings, wind_field

    def load_stl_scene(
        self,
        stl_path: str,
        wind_resolution: float = 10.0,
        base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0),
        flight_ceiling: float = 100.0,
        margin: float = 50.0
    ) -> Tuple[STLMesh, WindField, Tuple[Vector3, Vector3]]:
        """
        Load scene from STL file and generate wind field.

        The STL mesh is used directly for collision detection (more accurate
        than AABB approximations). Wind field is generated based on mesh bounds.

        Args:
            stl_path: Path to STL file
            wind_resolution: Wind field grid resolution in meters
            base_wind: Base wind velocity (vx, vy_vertical, vz)
            flight_ceiling: Maximum flight altitude above mesh top
            margin: Margin around mesh bounds for scene

        Returns:
            Tuple of (STLMesh, WindField, (bounds_min, bounds_max))
        """
        print(f"Loading STL from {stl_path}...")
        mesh = STLLoader.load_stl(
            stl_path,
            convert_coords=True,
            center_xy=True,
            ground_at_zero=True
        )

        # Calculate scene bounds from mesh with margin
        mesh_size = mesh.max_bounds - mesh.min_bounds
        bounds_min = Vector3(
            mesh.min_bounds[0] - margin,
            0,  # Ground level
            mesh.min_bounds[2] - margin
        )
        bounds_max = Vector3(
            mesh.max_bounds[0] + margin,
            mesh.max_bounds[1] + flight_ceiling,  # Ceiling above buildings
            mesh.max_bounds[2] + margin
        )

        print(f"Scene bounds: {bounds_min} to {bounds_max}")

        # Generate wind field for the scene
        # Note: We can't easily model building effects on wind without AABBs,
        # so we use a simplified model with altitude-based wind increase
        print(f"Generating wind field (resolution={wind_resolution}m)...")
        wind_field = self._generate_wind_field_for_mesh(
            bounds_min, bounds_max, mesh,
            resolution=wind_resolution,
            base_wind=base_wind
        )
        print(f"Wind field: {wind_field.nx}x{wind_field.ny}x{wind_field.nz}")

        return mesh, wind_field, (bounds_min, bounds_max)

    def _generate_wind_field_for_mesh(
        self,
        bounds_min: Vector3,
        bounds_max: Vector3,
        mesh: STLMesh,
        resolution: float = 10.0,
        base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0),
        altitude_factor: float = 0.02
    ) -> WindField:
        """
        Generate wind field for an STL mesh scene.

        Uses mesh geometry to create realistic wind effects:
        - Higher wind at altitude
        - Reduced wind/turbulence near mesh surfaces
        - Basic wake effects downwind of obstacles

        Args:
            bounds_min: Scene minimum bounds
            bounds_max: Scene maximum bounds
            mesh: STL mesh for collision/proximity checks
            resolution: Grid resolution in meters
            base_wind: Base wind velocity
            altitude_factor: Wind increase per meter of altitude

        Returns:
            WindField with generated data
        """
        # Calculate grid dimensions
        size = bounds_max - bounds_min
        nx = max(2, int(size.x / resolution) + 1)
        ny = max(2, int(size.y / resolution) + 1)
        nz = max(2, int(size.z / resolution) + 1)

        # Initialize arrays
        wind_data = np.zeros((nx, ny, nz, 3), dtype=np.float32)
        turbulence_data = np.zeros((nx, ny, nz), dtype=np.float32)

        base_wind_vec = np.array(base_wind, dtype=np.float32)
        base_wind_magnitude = np.linalg.norm([base_wind_vec[0], base_wind_vec[2]])

        mesh_top = mesh.max_bounds[1]  # Top of buildings

        # Generate wind for each cell
        for ix in range(nx):
            for iy in range(ny):
                for iz in range(nz):
                    pos = Vector3(
                        bounds_min.x + ix * resolution,
                        bounds_min.y + iy * resolution,
                        bounds_min.z + iz * resolution
                    )

                    # Start with base wind + altitude effect
                    altitude = pos.y
                    altitude_multiplier = 1.0 + altitude * altitude_factor
                    wind = base_wind_vec * altitude_multiplier

                    # Base turbulence (low)
                    turbulence = 0.05

                    # Check if near mesh surface
                    # Sample nearby points to estimate distance to mesh
                    in_mesh = mesh.point_inside(pos)
                    if in_mesh:
                        # Inside building - no wind
                        wind = np.zeros(3, dtype=np.float32)
                        turbulence = 0.0
                    else:
                        # Check proximity to mesh using nearby collision checks
                        near_surface = False
                        for offset in [
                            Vector3(resolution, 0, 0),
                            Vector3(-resolution, 0, 0),
                            Vector3(0, -resolution, 0),  # Only check down
                            Vector3(0, 0, resolution),
                            Vector3(0, 0, -resolution),
                        ]:
                            test_pos = pos + offset
                            if mesh.segment_intersects(pos, test_pos):
                                near_surface = True
                                break

                        if near_surface:
                            # Near building surface - add turbulence, reduce wind
                            if altitude < mesh_top:
                                wind = wind * 0.6
                                turbulence = 0.4
                            else:
                                # Above buildings but near surface
                                wind = wind * 0.8
                                turbulence = 0.25

                    wind_data[ix, iy, iz] = wind
                    turbulence_data[ix, iy, iz] = min(1.0, turbulence)

        return WindField(wind_data, turbulence_data, bounds_min, bounds_max)
