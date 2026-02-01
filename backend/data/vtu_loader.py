"""VTU file loader for CFD wind field data."""

from __future__ import annotations
import numpy as np
import time
from typing import Tuple, Optional
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from concurrent.futures import ThreadPoolExecutor

try:
    from tqdm import tqdm
    TQDM_AVAILABLE = True
except ImportError:
    TQDM_AVAILABLE = False

from ..grid.node import Vector3
from .wind_field import WindField


# Cache for loaded VTU data to avoid duplicate reads
_vtu_cache: dict = {}


class VTULoader:
    """Load CFD wind data from VTU files and create WindField objects."""

    @staticmethod
    def _load_vtu_raw(vtu_path: str, velocity_field_name: str = 'U') -> Tuple[np.ndarray, np.ndarray]:
        """
        Load raw VTU data with caching to avoid duplicate file reads.

        Returns:
            Tuple of (points, velocity) arrays
        """
        cache_key = (vtu_path, velocity_field_name)
        if cache_key in _vtu_cache:
            return _vtu_cache[cache_key]

        try:
            import pyvista as pv
        except ImportError:
            raise ImportError("pyvista is required to load VTU files. Install with: pip install pyvista")

        mesh = pv.read(vtu_path)
        points = mesh.points.copy()
        velocity = mesh.point_data[velocity_field_name].copy()

        _vtu_cache[cache_key] = (points, velocity)
        return points, velocity

    @staticmethod
    def load_vtu(
        vtu_path: str,
        bounds_min: Vector3,
        bounds_max: Vector3,
        resolution: float = 10.0,
        velocity_field_name: str = 'U',
        convert_coords: bool = True,
        offset: Optional[Tuple[float, float, float]] = None,
        default_wind: Tuple[float, float, float] = (5.0, 0.0, 0.0)
    ) -> WindField:
        """
        Load wind field from a VTU file.

        The VTU file contains unstructured point data which is interpolated
        onto a regular grid for use with the WindField class.

        Args:
            vtu_path: Path to the VTU file
            bounds_min: Minimum corner of the target volume
            bounds_max: Maximum corner of the target volume
            resolution: Grid cell size in meters
            velocity_field_name: Name of the velocity field in VTU (default 'U')
            convert_coords: If True, convert from Z-up (OpenFOAM) to Y-up (Three.js)
            offset: Optional (x, y, z) offset to apply to VTU points after coord conversion
            default_wind: Default wind velocity for points outside CFD domain

        Returns:
            WindField with interpolated data
        """
        total_start = time.time()

        # Define processing steps for progress bar
        steps = [
            "Loading VTU file",
            "Coordinate conversion",
            "Building Delaunay triangulation",
            "Interpolating velocity field",
            "Filling outside CFD domain",
            "Computing turbulence"
        ]

        # Create progress bar if tqdm is available
        if TQDM_AVAILABLE:
            pbar = tqdm(total=len(steps), desc="VTU Processing", unit="step",
                       bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]')
        else:
            pbar = None

        def update_progress(step_name: str, step_time: float = None):
            """Update progress bar with step completion."""
            if pbar:
                time_str = f" ({step_time:.1f}s)" if step_time else ""
                pbar.set_postfix_str(f"{step_name}{time_str}")
                pbar.update(1)
            else:
                time_str = f" in {step_time:.1f}s" if step_time else ""
                print(f"  [{steps.index(step_name) + 1}/{len(steps)}] {step_name}{time_str}")

        try:
            print(f"\nLoading VTU wind field from {vtu_path}")
            print(f"  Resolution: {resolution}m, Steps: {len(steps)}")

            # Step 1: Load the VTU mesh (cached to avoid duplicate reads)
            step_start = time.time()
            points, velocity = VTULoader._load_vtu_raw(vtu_path, velocity_field_name)
            points = points.copy()
            velocity = velocity.copy()
            update_progress("Loading VTU file", time.time() - step_start)

            print(f"  VTU contains {len(points):,} points")
            print(f"  VTU bounds (original): X[{points[:, 0].min():.1f}, {points[:, 0].max():.1f}], "
                  f"Y[{points[:, 1].min():.1f}, {points[:, 1].max():.1f}], "
                  f"Z[{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

            # Step 2: Coordinate conversion
            step_start = time.time()
            if convert_coords:
                # Convert from Z-up (OpenFOAM/CFD) to Y-up (Three.js/backend)
                points = np.column_stack([
                    points[:, 0],   # X stays X
                    points[:, 2],   # Z becomes Y (up)
                    -points[:, 1],  # Y becomes -Z (negated to match STL transform)
                ])
                velocity = np.column_stack([
                    velocity[:, 0],   # vx stays vx
                    velocity[:, 2],   # vz becomes vy (up)
                    -velocity[:, 1],  # vy becomes -vz (negated)
                ])

            # Apply offset if provided
            if offset is not None:
                offset_arr = np.array(offset)
                points = points + offset_arr
            update_progress("Coordinate conversion", time.time() - step_start)

            print(f"  VTU bounds (converted): X[{points[:, 0].min():.1f}, {points[:, 0].max():.1f}], "
                  f"Y[{points[:, 1].min():.1f}, {points[:, 1].max():.1f}], "
                  f"Z[{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

            # Calculate grid dimensions
            size = bounds_max - bounds_min
            nx = max(2, int(size.x / resolution) + 1)
            ny = max(2, int(size.y / resolution) + 1)
            nz = max(2, int(size.z / resolution) + 1)
            total_cells = nx * ny * nz

            print(f"  Creating grid: {nx}x{ny}x{nz} = {total_cells:,} cells")

            # Create the regular grid
            x_coords = np.linspace(bounds_min.x, bounds_max.x, nx)
            y_coords = np.linspace(bounds_min.y, bounds_max.y, ny)
            z_coords = np.linspace(bounds_min.z, bounds_max.z, nz)

            # Create meshgrid of target points
            grid_x, grid_y, grid_z = np.meshgrid(x_coords, y_coords, z_coords, indexing='ij')
            grid_points = np.column_stack([
                grid_x.ravel(),
                grid_y.ravel(),
                grid_z.ravel()
            ])

            # Step 3: Build interpolators (expensive Delaunay triangulation)
            step_start = time.time()
            if pbar:
                pbar.set_postfix_str("Building Delaunay triangulation... (slow)")
            else:
                print("  [3/6] Building Delaunay triangulation... (this may take a while)")

            linear_interp = LinearNDInterpolator(points, velocity, fill_value=np.nan)
            nearest_interp = NearestNDInterpolator(points, velocity)
            update_progress("Building Delaunay triangulation", time.time() - step_start)

            # Step 4: Interpolate velocity field
            step_start = time.time()
            if pbar:
                pbar.set_postfix_str(f"Interpolating {total_cells:,} grid points...")
            wind_data = linear_interp(grid_points).astype(np.float32)
            update_progress("Interpolating velocity field", time.time() - step_start)

            # Step 5: Fill NaN values with nearest neighbor interpolation
            step_start = time.time()
            nan_mask = np.isnan(wind_data[:, 0])
            nan_count = int(np.sum(nan_mask))

            if nan_count > 0:
                pct = 100 * nan_count / len(grid_points)
                if pbar:
                    pbar.set_postfix_str(f"Filling {nan_count:,} points ({pct:.1f}%) outside domain...")
                wind_data[nan_mask] = nearest_interp(grid_points[nan_mask]).astype(np.float32)
                update_progress("Filling outside CFD domain", time.time() - step_start)
                print(f"  Filled {nan_count:,} points ({pct:.1f}%) outside CFD domain")
            else:
                update_progress("Filling outside CFD domain", time.time() - step_start)

            # Reshape to grid dimensions
            wind_data = wind_data.reshape((nx, ny, nz, 3))

            # Step 6: Calculate turbulence from velocity gradient magnitude
            step_start = time.time()
            turbulence_data = VTULoader._compute_turbulence(wind_data, resolution)
            update_progress("Computing turbulence", time.time() - step_start)

            speed = np.linalg.norm(wind_data, axis=-1)
            print(f"  Wind speed range: {speed.min():.2f} - {speed.max():.2f} m/s")
            print(f"  Turbulence range: {turbulence_data.min():.3f} - {turbulence_data.max():.3f}")

            total_elapsed = time.time() - total_start
            print(f"  VTU processing complete in {total_elapsed:.1f}s\n")

            return WindField(wind_data, turbulence_data, bounds_min, bounds_max)

        finally:
            if pbar:
                pbar.close()

    @staticmethod
    def _compute_turbulence(wind_data: np.ndarray, resolution: float) -> np.ndarray:
        """
        Compute turbulence intensity from wind field gradients.

        Turbulence is estimated from the local velocity gradient magnitude,
        normalized to 0-1 range.

        Args:
            wind_data: (nx, ny, nz, 3) wind velocity array
            resolution: Grid spacing in meters

        Returns:
            (nx, ny, nz) turbulence intensity array
        """
        # Use numpy gradient for efficiency
        speed = np.linalg.norm(wind_data, axis=-1)

        # Compute gradients along each axis
        grad_x = np.gradient(speed, resolution, axis=0)
        grad_y = np.gradient(speed, resolution, axis=1)
        grad_z = np.gradient(speed, resolution, axis=2)

        # Turbulence proportional to gradient magnitude
        grad_magnitude = np.sqrt(grad_x**2 + grad_y**2 + grad_z**2)

        # Normalize by local speed (with floor to avoid division issues)
        turbulence = grad_magnitude / np.maximum(speed, 1.0)

        # Normalize to 0-1 range
        if turbulence.max() > 0:
            turbulence = turbulence / turbulence.max()

        # Clamp extreme values
        turbulence = np.clip(turbulence, 0.0, 1.0).astype(np.float32)

        return turbulence

    @staticmethod
    def get_vtu_bounds(vtu_path: str, convert_coords: bool = True) -> Tuple[np.ndarray, np.ndarray]:
        """
        Get the bounds of a VTU file without loading the full wind field.

        Args:
            vtu_path: Path to VTU file
            convert_coords: If True, convert from Z-up to Y-up

        Returns:
            Tuple of (min_bounds, max_bounds) as numpy arrays
        """
        # Use cached loader to avoid duplicate file reads
        points, _ = VTULoader._load_vtu_raw(vtu_path)

        if convert_coords:
            # Convert from Z-up to Y-up (with negation matching STL transform)
            points = np.column_stack([
                points[:, 0],
                points[:, 2],
                -points[:, 1],
            ])

        min_bounds = points.min(axis=0)
        max_bounds = points.max(axis=0)

        return min_bounds, max_bounds

    @staticmethod
    def compute_alignment_offset(
        vtu_path: str,
        target_center_x: float,
        target_center_z: float,
        convert_coords: bool = True
    ) -> Tuple[float, float, float]:
        """
        Compute offset needed to align VTU center with target center.

        This is useful when the STL mesh has been centered but the VTU
        data uses the original (uncentered) coordinates.

        Args:
            vtu_path: Path to VTU file
            target_center_x: Target X center coordinate
            target_center_z: Target Z center coordinate
            convert_coords: If True, convert VTU from Z-up to Y-up

        Returns:
            (offset_x, offset_y, offset_z) to apply to VTU points
        """
        vtu_min, vtu_max = VTULoader.get_vtu_bounds(vtu_path, convert_coords)
        vtu_center_x = (vtu_min[0] + vtu_max[0]) / 2
        vtu_center_z = (vtu_min[2] + vtu_max[2]) / 2

        offset_x = target_center_x - vtu_center_x
        offset_z = target_center_z - vtu_center_z

        print(f"VTU center: ({vtu_center_x:.1f}, {vtu_center_z:.1f})")
        print(f"Target center: ({target_center_x:.1f}, {target_center_z:.1f})")
        print(f"Computed offset: ({offset_x:.1f}, 0, {offset_z:.1f})")

        return (offset_x, 0.0, offset_z)
