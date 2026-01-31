"""Wind field data from CFD simulation."""

from __future__ import annotations
import numpy as np
from typing import Tuple, Optional
from ..grid.node import Vector3


class WindField:
    """
    3D wind field storing velocity and turbulence data.

    Wind data is stored as numpy arrays for efficient interpolation.
    """

    def __init__(self, wind_data: np.ndarray, turbulence_data: np.ndarray,
                 bounds_min: Vector3, bounds_max: Vector3):
        """
        Initialize wind field.

        Args:
            wind_data: 4D array (nx, ny, nz, 3) of wind velocities (vx, vy, vz)
            turbulence_data: 3D array (nx, ny, nz) of turbulence intensities
            bounds_min: Minimum corner of the wind field volume
            bounds_max: Maximum corner of the wind field volume
        """
        self.wind_data = wind_data
        self.turbulence_data = turbulence_data
        self.bounds_min = bounds_min
        self.bounds_max = bounds_max

        # Grid dimensions
        self.nx, self.ny, self.nz = wind_data.shape[:3]

        # Calculate cell size
        size = bounds_max - bounds_min
        self.cell_size = Vector3(
            size.x / max(1, self.nx - 1),
            size.y / max(1, self.ny - 1),
            size.z / max(1, self.nz - 1)
        )

    def _position_to_index(self, position: Vector3) -> Tuple[float, float, float]:
        """Convert world position to continuous grid indices."""
        rel = position - self.bounds_min
        ix = rel.x / self.cell_size.x if self.cell_size.x > 0 else 0
        iy = rel.y / self.cell_size.y if self.cell_size.y > 0 else 0
        iz = rel.z / self.cell_size.z if self.cell_size.z > 0 else 0
        return ix, iy, iz

    def _trilinear_interpolate_wind(self, ix: float, iy: float, iz: float) -> Vector3:
        """Trilinear interpolation for wind vector."""
        # Clamp to valid range (use small epsilon to avoid edge case at exact boundary)
        eps = 1e-6
        ix = max(0.0, min(float(self.nx - 1) - eps, ix))
        iy = max(0.0, min(float(self.ny - 1) - eps, iy))
        iz = max(0.0, min(float(self.nz - 1) - eps, iz))

        # Get integer indices and fractions
        x0, y0, z0 = int(ix), int(iy), int(iz)
        x1 = min(x0 + 1, self.nx - 1)
        y1 = min(y0 + 1, self.ny - 1)
        z1 = min(z0 + 1, self.nz - 1)

        xf, yf, zf = ix - x0, iy - y0, iz - z0

        # Trilinear interpolation
        result = np.zeros(3)
        for i, (xi, wx) in enumerate([(x0, 1 - xf), (x1, xf)]):
            for j, (yi, wy) in enumerate([(y0, 1 - yf), (y1, yf)]):
                for k, (zi, wz) in enumerate([(z0, 1 - zf), (z1, zf)]):
                    weight = wx * wy * wz
                    result += weight * self.wind_data[xi, yi, zi]

        return Vector3(result[0], result[1], result[2])

    def _trilinear_interpolate_turbulence(self, ix: float, iy: float,
                                          iz: float) -> float:
        """Trilinear interpolation for turbulence scalar."""
        # Clamp to valid range (use small epsilon to avoid edge case at exact boundary)
        eps = 1e-6
        ix = max(0.0, min(float(self.nx - 1) - eps, ix))
        iy = max(0.0, min(float(self.ny - 1) - eps, iy))
        iz = max(0.0, min(float(self.nz - 1) - eps, iz))

        # Get integer indices and fractions
        x0, y0, z0 = int(ix), int(iy), int(iz)
        x1 = min(x0 + 1, self.nx - 1)
        y1 = min(y0 + 1, self.ny - 1)
        z1 = min(z0 + 1, self.nz - 1)

        xf, yf, zf = ix - x0, iy - y0, iz - z0

        # Trilinear interpolation
        result = 0.0
        for xi, wx in [(x0, 1 - xf), (x1, xf)]:
            for yi, wy in [(y0, 1 - yf), (y1, yf)]:
                for zi, wz in [(z0, 1 - zf), (z1, zf)]:
                    weight = wx * wy * wz
                    result += weight * self.turbulence_data[xi, yi, zi]

        return result

    def get_wind_at(self, position: Vector3) -> Vector3:
        """Get interpolated wind velocity at a world position."""
        ix, iy, iz = self._position_to_index(position)
        return self._trilinear_interpolate_wind(ix, iy, iz)

    def get_turbulence_at(self, position: Vector3) -> float:
        """Get interpolated turbulence intensity at a world position."""
        ix, iy, iz = self._position_to_index(position)
        return self._trilinear_interpolate_turbulence(ix, iy, iz)

    def get_wind_and_turbulence_at(self, position: Vector3) -> Tuple[Vector3, float]:
        """Get both wind and turbulence at a position (more efficient)."""
        ix, iy, iz = self._position_to_index(position)
        wind = self._trilinear_interpolate_wind(ix, iy, iz)
        turbulence = self._trilinear_interpolate_turbulence(ix, iy, iz)
        return wind, turbulence

    def save_npz(self, filepath: str) -> None:
        """Save wind field to NPZ file."""
        np.savez_compressed(
            filepath,
            wind=self.wind_data,
            turbulence=self.turbulence_data,
            bounds_min=self.bounds_min.to_list(),
            bounds_max=self.bounds_max.to_list()
        )

    @classmethod
    def load_npz(cls, filepath: str) -> WindField:
        """Load wind field from NPZ file."""
        data = np.load(filepath)
        return cls(
            wind_data=data['wind'],
            turbulence_data=data['turbulence'],
            bounds_min=Vector3.from_list(data['bounds_min']),
            bounds_max=Vector3.from_list(data['bounds_max'])
        )

    def __repr__(self) -> str:
        return (f"WindField({self.nx}x{self.ny}x{self.nz}, "
                f"bounds={self.bounds_min} to {self.bounds_max})")
