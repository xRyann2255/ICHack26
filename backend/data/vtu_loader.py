"""VTU file loader for CFD wind field data.

Loads wind velocity data from OpenFOAM VTU files and normalizes it
to fit the scene bounds (STL mesh bounds).

OpenFOAM coordinate system (Z-up):
    X: east-west
    Y: north-south
    Z: altitude (up)

Scene coordinate system (Y-up, matches Three.js):
    X: east-west (same)
    Y: altitude (was Z)
    Z: depth (was -Y, negated)
"""

from __future__ import annotations
import numpy as np
import time
from typing import Tuple, Optional
from scipy.spatial import cKDTree

try:
    from tqdm import tqdm
    TQDM_AVAILABLE = True
except ImportError:
    TQDM_AVAILABLE = False

from ..grid.node import Vector3
from .wind_field import WindField


class VTULoader:
    """Load CFD wind data from VTU files and create WindField objects."""

    @staticmethod
    def load_vtu_raw(vtu_path: str) -> Tuple[np.ndarray, np.ndarray]:
        """
        Load raw points and velocity from VTU file.

        Returns data in ORIGINAL OpenFOAM coordinates (Z-up).

        Returns:
            Tuple of (points, velocity) arrays in OpenFOAM coords
        """
        try:
            import pyvista as pv
        except ImportError:
            raise ImportError("pyvista required: pip install pyvista")

        print(f"\n=== Loading VTU: {vtu_path} ===")
        mesh = pv.read(vtu_path)

        print(f"Mesh type: {type(mesh).__name__}")
        print(f"Number of points: {mesh.n_points}")
        print(f"Number of cells: {mesh.n_cells}")
        print(f"Point data arrays: {list(mesh.point_data.keys())}")
        print(f"Cell data arrays: {list(mesh.cell_data.keys())}")

        # Get velocity - prefer cell_data as it's more common in OpenFOAM output
        if 'U' in mesh.cell_data:
            print("Using cell_data['U'] (cell centers)")
            points = mesh.cell_centers().points.copy()
            velocity = mesh.cell_data['U'].copy()
        elif 'U' in mesh.point_data:
            print("Using point_data['U'] (mesh vertices)")
            points = mesh.points.copy()
            velocity = mesh.point_data['U'].copy()
        else:
            available = list(mesh.point_data.keys()) + list(mesh.cell_data.keys())
            raise KeyError(f"No 'U' velocity field found. Available: {available}")

        print(f"\nRaw data shapes:")
        print(f"  Points: {points.shape}")
        print(f"  Velocity: {velocity.shape}")

        print(f"\nOpenFOAM bounds (Z-up):")
        print(f"  X: [{points[:, 0].min():.1f}, {points[:, 0].max():.1f}]")
        print(f"  Y: [{points[:, 1].min():.1f}, {points[:, 1].max():.1f}]")
        print(f"  Z: [{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

        speed = np.linalg.norm(velocity, axis=1)
        print(f"\nVelocity stats:")
        print(f"  Speed range: [{speed.min():.2f}, {speed.max():.2f}] m/s")
        print(f"  Mean speed: {speed.mean():.2f} m/s")
        print(f"  Non-zero vectors: {np.sum(speed > 0.01)} / {len(speed)}")

        return points, velocity

    @staticmethod
    def convert_openfoam_to_scene(
        points: np.ndarray,
        velocity: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Convert from OpenFOAM (Z-up) to scene (Y-up) coordinates.

        OpenFOAM: (x, y, z) where z is up
        Scene:    (x, y, z) where y is up

        Transform:
            scene_x = openfoam_x
            scene_y = openfoam_z  (height)
            scene_z = -openfoam_y (negated for correct orientation)
        """
        scene_points = np.column_stack([
            points[:, 0],    # X stays X
            points[:, 2],    # Z becomes Y (up)
            -points[:, 1],   # Y becomes -Z
        ])

        scene_velocity = np.column_stack([
            velocity[:, 0],   # vx stays vx
            velocity[:, 2],   # vz becomes vy
            -velocity[:, 1],  # vy becomes -vz
        ])

        return scene_points, scene_velocity

    @staticmethod
    def normalize_to_bounds(
        points: np.ndarray,
        velocity: np.ndarray,
        target_min: np.ndarray,
        target_max: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Scale and translate points to fit within target bounds.

        The velocity vectors are NOT scaled - they keep their physical m/s values.
        Only positions are transformed.

        Returns:
            Tuple of (normalized_points, velocity, scale, offset)
        """
        source_min = points.min(axis=0)
        source_max = points.max(axis=0)
        source_size = source_max - source_min
        target_size = target_max - target_min

        # Compute scale (avoid div by zero)
        scale = np.where(source_size > 0.01, target_size / source_size, 1.0)

        # Compute offset: target_min = source_min * scale + offset
        offset = target_min - source_min * scale

        # Apply transform to points only
        normalized_points = points * scale + offset

        print(f"\nNormalization transform:")
        print(f"  Source bounds: [{source_min[0]:.1f}, {source_min[1]:.1f}, {source_min[2]:.1f}] to [{source_max[0]:.1f}, {source_max[1]:.1f}, {source_max[2]:.1f}]")
        print(f"  Target bounds: [{target_min[0]:.1f}, {target_min[1]:.1f}, {target_min[2]:.1f}] to [{target_max[0]:.1f}, {target_max[1]:.1f}, {target_max[2]:.1f}]")
        print(f"  Scale: [{scale[0]:.4f}, {scale[1]:.4f}, {scale[2]:.4f}]")
        print(f"  Offset: [{offset[0]:.1f}, {offset[1]:.1f}, {offset[2]:.1f}]")

        # Verify
        result_min = normalized_points.min(axis=0)
        result_max = normalized_points.max(axis=0)
        print(f"  Result bounds: [{result_min[0]:.1f}, {result_min[1]:.1f}, {result_min[2]:.1f}] to [{result_max[0]:.1f}, {result_max[1]:.1f}, {result_max[2]:.1f}]")

        return normalized_points, velocity, scale, offset

    @staticmethod
    def create_wind_field(
        points: np.ndarray,
        velocity: np.ndarray,
        bounds_min: Vector3,
        bounds_max: Vector3,
        resolution: float = 10.0
    ) -> WindField:
        """
        Create a WindField by interpolating scattered VTU data onto a regular grid.

        Uses KD-tree with inverse distance weighting for fast interpolation.
        """
        print(f"\n=== Creating WindField grid ===")

        # Calculate grid dimensions
        size_x = bounds_max.x - bounds_min.x
        size_y = bounds_max.y - bounds_min.y
        size_z = bounds_max.z - bounds_min.z

        nx = max(2, int(size_x / resolution) + 1)
        ny = max(2, int(size_y / resolution) + 1)
        nz = max(2, int(size_z / resolution) + 1)

        print(f"Grid: {nx} x {ny} x {nz} = {nx*ny*nz:,} cells")
        print(f"Resolution: {resolution}m")

        # Create regular grid points
        x_coords = np.linspace(bounds_min.x, bounds_max.x, nx)
        y_coords = np.linspace(bounds_min.y, bounds_max.y, ny)
        z_coords = np.linspace(bounds_min.z, bounds_max.z, nz)

        grid_x, grid_y, grid_z = np.meshgrid(x_coords, y_coords, z_coords, indexing='ij')
        grid_points = np.column_stack([
            grid_x.ravel(),
            grid_y.ravel(),
            grid_z.ravel()
        ])

        # Build KD-tree for fast nearest neighbor lookup
        print("Building KD-tree...")
        tree = cKDTree(points)

        # Query k nearest neighbors for interpolation
        k = min(8, len(points))
        print(f"Querying {k} nearest neighbors for {len(grid_points):,} grid points...")

        distances, indices = tree.query(grid_points, k=k)

        # Inverse distance weighting
        # Handle zero distances (exact matches)
        with np.errstate(divide='ignore', invalid='ignore'):
            weights = 1.0 / np.maximum(distances, 1e-10)
            weights_sum = weights.sum(axis=1, keepdims=True)
            weights = weights / weights_sum

        # Interpolate velocity
        print("Interpolating velocity field...")
        wind_data = np.zeros((len(grid_points), 3), dtype=np.float32)
        for i in range(k):
            wind_data += weights[:, i:i+1] * velocity[indices[:, i]]

        # Reshape to grid
        wind_data = wind_data.reshape((nx, ny, nz, 3))

        # Compute turbulence from velocity gradients
        print("Computing turbulence...")
        turbulence = VTULoader._compute_turbulence(wind_data, resolution)

        # Stats
        speed = np.linalg.norm(wind_data, axis=-1)
        print(f"\nWindField stats:")
        print(f"  Speed range: [{speed.min():.2f}, {speed.max():.2f}] m/s")
        print(f"  Mean speed: {speed.mean():.2f} m/s")
        print(f"  Turbulence range: [{turbulence.min():.3f}, {turbulence.max():.3f}]")

        return WindField(wind_data, turbulence, bounds_min, bounds_max)

    @staticmethod
    def _compute_turbulence(wind_data: np.ndarray, resolution: float) -> np.ndarray:
        """Compute turbulence intensity from velocity gradients."""
        speed = np.linalg.norm(wind_data, axis=-1)

        # Gradient magnitude
        grad_x = np.gradient(speed, resolution, axis=0)
        grad_y = np.gradient(speed, resolution, axis=1)
        grad_z = np.gradient(speed, resolution, axis=2)
        grad_mag = np.sqrt(grad_x**2 + grad_y**2 + grad_z**2)

        # Normalize by local speed
        turbulence = grad_mag / np.maximum(speed, 1.0)

        # Normalize to 0-1 range
        if turbulence.max() > 0:
            turbulence = turbulence / turbulence.max()

        return np.clip(turbulence, 0.0, 1.0).astype(np.float32)

    @staticmethod
    def load_and_normalize(
        vtu_path: str,
        scene_bounds_min: Vector3,
        scene_bounds_max: Vector3,
        resolution: float = 10.0
    ) -> WindField:
        """
        Main entry point: Load VTU, convert coords, normalize to scene, create WindField.

        Args:
            vtu_path: Path to VTU file
            scene_bounds_min: Scene minimum corner (from STL)
            scene_bounds_max: Scene maximum corner (from STL)
            resolution: Wind field grid resolution in meters

        Returns:
            WindField normalized to scene bounds
        """
        start_time = time.time()

        # Step 1: Load raw VTU data (OpenFOAM coordinates)
        points_of, velocity_of = VTULoader.load_vtu_raw(vtu_path)

        # Step 2: Convert from OpenFOAM (Z-up) to scene (Y-up) coordinates
        print("\n=== Converting to scene coordinates (Y-up) ===")
        points_scene, velocity_scene = VTULoader.convert_openfoam_to_scene(
            points_of, velocity_of
        )

        print(f"Scene coords bounds:")
        print(f"  X: [{points_scene[:, 0].min():.1f}, {points_scene[:, 0].max():.1f}]")
        print(f"  Y: [{points_scene[:, 1].min():.1f}, {points_scene[:, 1].max():.1f}]")
        print(f"  Z: [{points_scene[:, 2].min():.1f}, {points_scene[:, 2].max():.1f}]")

        # Step 3: Normalize positions to fit scene bounds
        print("\n=== Normalizing to scene bounds ===")
        target_min = np.array([scene_bounds_min.x, scene_bounds_min.y, scene_bounds_min.z])
        target_max = np.array([scene_bounds_max.x, scene_bounds_max.y, scene_bounds_max.z])

        points_normalized, velocity_normalized, scale, offset = VTULoader.normalize_to_bounds(
            points_scene, velocity_scene, target_min, target_max
        )

        # Step 4: Create WindField on regular grid
        wind_field = VTULoader.create_wind_field(
            points_normalized,
            velocity_normalized,
            scene_bounds_min,
            scene_bounds_max,
            resolution
        )

        elapsed = time.time() - start_time
        print(f"\n=== VTU loading complete in {elapsed:.1f}s ===\n")

        return wind_field
