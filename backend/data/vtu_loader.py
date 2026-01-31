"""VTU file loader for CFD wind field data."""

from __future__ import annotations
import numpy as np
from typing import Tuple, Optional
from scipy.interpolate import griddata

from ..grid.node import Vector3
from .wind_field import WindField


class VTULoader:
    """Load CFD wind data from VTU files and create WindField objects."""

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
        try:
            import pyvista as pv
        except ImportError:
            raise ImportError("pyvista is required to load VTU files. Install with: pip install pyvista")

        print(f"Loading VTU wind field from {vtu_path}...")

        # Load the VTU mesh
        mesh = pv.read(vtu_path)
        points = mesh.points.copy()  # (N, 3)
        velocity = mesh.point_data[velocity_field_name].copy()  # (N, 3)

        print(f"  VTU contains {len(points)} points")
        print(f"  VTU bounds (original): X[{points[:, 0].min():.1f}, {points[:, 0].max():.1f}], "
              f"Y[{points[:, 1].min():.1f}, {points[:, 1].max():.1f}], "
              f"Z[{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

        if convert_coords:
            # Convert from Z-up (OpenFOAM/CFD) to Y-up (Three.js/backend)
            # OpenFOAM: X=east, Y=north, Z=up
            # Backend: X=east, Y=up, Z=north (but negated: Z=-Y_original)
            # Match STL transformation: (x, z, -y)
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
            print("  Converted coordinates from Z-up to Y-up (with Y negation)")

        # Apply offset if provided
        if offset is not None:
            offset_arr = np.array(offset)
            points = points + offset_arr
            print(f"  Applied offset: {offset}")

        print(f"  VTU bounds (converted): X[{points[:, 0].min():.1f}, {points[:, 0].max():.1f}], "
              f"Y[{points[:, 1].min():.1f}, {points[:, 1].max():.1f}], "
              f"Z[{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

        # Report scene bounds
        print(f"  Scene bounds: X[{bounds_min.x:.1f}, {bounds_max.x:.1f}], "
              f"Y[{bounds_min.y:.1f}, {bounds_max.y:.1f}], "
              f"Z[{bounds_min.z:.1f}, {bounds_max.z:.1f}]")

        # Calculate grid dimensions
        size = bounds_max - bounds_min
        nx = max(2, int(size.x / resolution) + 1)
        ny = max(2, int(size.y / resolution) + 1)
        nz = max(2, int(size.z / resolution) + 1)

        print(f"  Creating grid: {nx}x{ny}x{nz} = {nx*ny*nz} cells")

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

        # Interpolate velocity components
        print("  Interpolating velocity field (this may take a moment)...")

        # Use linear interpolation, with default values for points outside convex hull
        wind_data = np.zeros((nx * ny * nz, 3), dtype=np.float32)
        default_wind_arr = np.array(default_wind, dtype=np.float32)

        for i, component in enumerate(['vx', 'vy', 'vz']):
            print(f"    Interpolating {component}...")
            interpolated = griddata(
                points,
                velocity[:, i],
                grid_points,
                method='linear',
                fill_value=np.nan
            )

            # Count NaN values (outside CFD domain)
            nan_count = np.sum(np.isnan(interpolated))

            # Fill NaN values with nearest neighbor interpolation
            # This gives reasonable values near the domain boundary
            nan_mask = np.isnan(interpolated)
            if nan_mask.any():
                try:
                    nearest = griddata(
                        points,
                        velocity[:, i],
                        grid_points[nan_mask],
                        method='nearest'
                    )
                    interpolated[nan_mask] = nearest
                except Exception as e:
                    # If nearest fails, use default
                    print(f"      Warning: nearest interpolation failed, using default: {e}")
                    interpolated[nan_mask] = default_wind_arr[i]

            wind_data[:, i] = interpolated

            if nan_count > 0:
                pct = 100 * nan_count / len(interpolated)
                print(f"      {nan_count} points ({pct:.1f}%) outside CFD domain, filled with nearest")

        # Reshape to grid dimensions
        wind_data = wind_data.reshape((nx, ny, nz, 3))

        # Calculate turbulence from velocity gradient magnitude
        print("  Computing turbulence field...")
        turbulence_data = VTULoader._compute_turbulence(wind_data, resolution)

        speed = np.linalg.norm(wind_data, axis=-1)
        print(f"  Wind speed range: {speed.min():.2f} - {speed.max():.2f} m/s")
        print(f"  Turbulence range: {turbulence_data.min():.3f} - {turbulence_data.max():.3f}")

        return WindField(wind_data, turbulence_data, bounds_min, bounds_max)

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
        try:
            import pyvista as pv
        except ImportError:
            raise ImportError("pyvista is required to load VTU files. Install with: pip install pyvista")

        mesh = pv.read(vtu_path)
        points = mesh.points

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
