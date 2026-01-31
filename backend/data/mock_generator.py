"""Mock data generator for development and testing."""

from __future__ import annotations
import numpy as np
from typing import Tuple, Optional

from ..grid.node import Vector3
from .building_geometry import Building, BuildingCollection
from .wind_field import WindField
from .stl_loader import STLLoader, STLMesh
from .vtu_loader import VTULoader


class MockDataGenerator:
    """Generate mock CFD-like wind data for testing."""

    def __init__(self):
        """Initialize generator."""
        pass

    def generate_wind_field(
        self,
        bounds_min: Vector3,
        bounds_max: Vector3,
        resolution: float = 5.0,
        base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0),
        altitude_factor: float = 0.005,
        mesh: Optional[STLMesh] = None
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
            resolution: Grid cell size in meters
            base_wind: Base wind velocity (vx, vy, vz) at ground level
            altitude_factor: Wind speed increase per meter of altitude (Y axis)
            mesh: Optional STL mesh for geometry-aware wind effects

        Returns:
            WindField with generated data
        """
        # If mesh is provided, use the mesh-aware generator
        if mesh is not None:
            return self._generate_wind_field_for_mesh(
                bounds_min, bounds_max, mesh,
                resolution=resolution,
                base_wind=base_wind,
                altitude_factor=altitude_factor
            )

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

    def load_stl_scene(
        self,
        stl_path: str,
        wind_resolution: float = 10.0,
        base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0),
        flight_ceiling: float = 100.0,
        margin: float = 50.0,
        vtu_path: Optional[str] = None
    ) -> Tuple[STLMesh, WindField, Tuple[Vector3, Vector3]]:
        """
        Load scene from STL file and wind field from VTU or generate mock.

        The STL mesh is used directly for collision detection (more accurate
        than AABB approximations). Wind field is loaded from VTU file if provided,
        otherwise generated based on mesh bounds.

        Args:
            stl_path: Path to STL file
            wind_resolution: Wind field grid resolution in meters
            base_wind: Base wind velocity (vx, vy_vertical, vz) - used for mock only
            flight_ceiling: Maximum flight altitude above mesh top
            margin: Margin around mesh bounds for scene
            vtu_path: Optional path to VTU file with CFD wind data

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

        # Load wind field from VTU if provided, otherwise generate mock
        if vtu_path:
            print(f"Loading CFD wind field from {vtu_path}...")
            # The STL mesh is centered horizontally (center_xy=True), so the
            # scene center is at (0, 0) in XZ plane. We need to align the VTU
            # data with this centered coordinate system.
            offset = VTULoader.compute_alignment_offset(
                vtu_path,
                target_center_x=0.0,  # Mesh is centered at X=0
                target_center_z=0.0,  # Mesh is centered at Z=0
                convert_coords=True
            )
            wind_field = VTULoader.load_vtu(
                vtu_path,
                bounds_min,
                bounds_max,
                resolution=wind_resolution,
                convert_coords=True,
                offset=offset
            )
        else:
            # Generate mock wind field
            print(f"Generating mock wind field (resolution={wind_resolution}m)...")
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
        # Use altitude-based heuristics instead of expensive per-cell mesh queries
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

                    # Base turbulence (low at altitude, higher near ground)
                    if altitude < 5:
                        # Near ground - likely inside or near buildings
                        wind = wind * 0.3
                        turbulence = 0.5
                    elif altitude < mesh_top * 0.5:
                        # Low altitude, in building zone
                        wind = wind * 0.6
                        turbulence = 0.35
                    elif altitude < mesh_top:
                        # Mid altitude, some building effects
                        wind = wind * 0.8
                        turbulence = 0.2
                    elif altitude < mesh_top * 1.5:
                        # Just above buildings - some turbulence
                        turbulence = 0.15
                    else:
                        # High altitude - clear air
                        turbulence = 0.05

                    wind_data[ix, iy, iz] = wind
                    turbulence_data[ix, iy, iz] = min(1.0, turbulence)

        return WindField(wind_data, turbulence_data, bounds_min, bounds_max)
