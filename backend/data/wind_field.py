"""Wind field data from CFD simulation."""

from __future__ import annotations
import numpy as np
from typing import Tuple, Optional
from ..grid.node import Vector3

# Try to import CuPy for GPU acceleration
CUPY_AVAILABLE = False
cp = None
try:
    import warnings
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="CUDA path could not be detected")
        import cupy as _cp
    # Test if CuPy actually works by running a simple GPU operation
    # This will fail if CUDA toolkit is not properly installed
    try:
        _test = _cp.array([1.0, 2.0, 3.0])
        _result = _test + _test  # Force actual GPU computation
        _result.get()  # Transfer back to CPU to ensure it worked
        del _test, _result
        cp = _cp
        CUPY_AVAILABLE = True
    except Exception:
        # CuPy imported but CUDA toolkit not available
        pass
except ImportError:
    pass


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

    def get_wind_batch(self, positions: np.ndarray) -> np.ndarray:
        """
        Batch get wind vectors at multiple positions using vectorized operations.

        Args:
            positions: (N, 3) array of world positions

        Returns:
            (N, 3) array of wind vectors
        """
        return self._trilinear_interpolate_wind_batch(positions)

    def get_turbulence_batch(self, positions: np.ndarray) -> np.ndarray:
        """
        Batch get turbulence values at multiple positions using vectorized operations.

        Args:
            positions: (N, 3) array of world positions

        Returns:
            (N,) array of turbulence values
        """
        return self._trilinear_interpolate_turbulence_batch(positions)

    def _positions_to_indices_batch(self, positions: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Convert world positions to continuous grid indices (vectorized)."""
        rel = positions - np.array([self.bounds_min.x, self.bounds_min.y, self.bounds_min.z])
        cell_sizes = np.array([self.cell_size.x, self.cell_size.y, self.cell_size.z])
        # Avoid division by zero
        cell_sizes = np.where(cell_sizes > 0, cell_sizes, 1.0)
        indices = rel / cell_sizes
        return indices[:, 0], indices[:, 1], indices[:, 2]

    def _trilinear_interpolate_wind_batch(self, positions: np.ndarray) -> np.ndarray:
        """Vectorized trilinear interpolation for wind vectors."""
        ix, iy, iz = self._positions_to_indices_batch(positions)

        # Clamp to valid range
        eps = 1e-6
        ix = np.clip(ix, 0.0, float(self.nx - 1) - eps)
        iy = np.clip(iy, 0.0, float(self.ny - 1) - eps)
        iz = np.clip(iz, 0.0, float(self.nz - 1) - eps)

        # Get integer indices
        x0 = ix.astype(np.int32)
        y0 = iy.astype(np.int32)
        z0 = iz.astype(np.int32)
        x1 = np.minimum(x0 + 1, self.nx - 1)
        y1 = np.minimum(y0 + 1, self.ny - 1)
        z1 = np.minimum(z0 + 1, self.nz - 1)

        # Fractional parts
        xf = ix - x0
        yf = iy - y0
        zf = iz - z0

        # Weights for trilinear interpolation (8 corners)
        w000 = (1 - xf) * (1 - yf) * (1 - zf)
        w001 = (1 - xf) * (1 - yf) * zf
        w010 = (1 - xf) * yf * (1 - zf)
        w011 = (1 - xf) * yf * zf
        w100 = xf * (1 - yf) * (1 - zf)
        w101 = xf * (1 - yf) * zf
        w110 = xf * yf * (1 - zf)
        w111 = xf * yf * zf

        # Gather values from all 8 corners and interpolate
        result = (
            w000[:, np.newaxis] * self.wind_data[x0, y0, z0] +
            w001[:, np.newaxis] * self.wind_data[x0, y0, z1] +
            w010[:, np.newaxis] * self.wind_data[x0, y1, z0] +
            w011[:, np.newaxis] * self.wind_data[x0, y1, z1] +
            w100[:, np.newaxis] * self.wind_data[x1, y0, z0] +
            w101[:, np.newaxis] * self.wind_data[x1, y0, z1] +
            w110[:, np.newaxis] * self.wind_data[x1, y1, z0] +
            w111[:, np.newaxis] * self.wind_data[x1, y1, z1]
        )

        return result

    def _trilinear_interpolate_turbulence_batch(self, positions: np.ndarray) -> np.ndarray:
        """Vectorized trilinear interpolation for turbulence scalars."""
        ix, iy, iz = self._positions_to_indices_batch(positions)

        # Clamp to valid range
        eps = 1e-6
        ix = np.clip(ix, 0.0, float(self.nx - 1) - eps)
        iy = np.clip(iy, 0.0, float(self.ny - 1) - eps)
        iz = np.clip(iz, 0.0, float(self.nz - 1) - eps)

        # Get integer indices
        x0 = ix.astype(np.int32)
        y0 = iy.astype(np.int32)
        z0 = iz.astype(np.int32)
        x1 = np.minimum(x0 + 1, self.nx - 1)
        y1 = np.minimum(y0 + 1, self.ny - 1)
        z1 = np.minimum(z0 + 1, self.nz - 1)

        # Fractional parts
        xf = ix - x0
        yf = iy - y0
        zf = iz - z0

        # Weights for trilinear interpolation
        w000 = (1 - xf) * (1 - yf) * (1 - zf)
        w001 = (1 - xf) * (1 - yf) * zf
        w010 = (1 - xf) * yf * (1 - zf)
        w011 = (1 - xf) * yf * zf
        w100 = xf * (1 - yf) * (1 - zf)
        w101 = xf * (1 - yf) * zf
        w110 = xf * yf * (1 - zf)
        w111 = xf * yf * zf

        # Gather and interpolate
        result = (
            w000 * self.turbulence_data[x0, y0, z0] +
            w001 * self.turbulence_data[x0, y0, z1] +
            w010 * self.turbulence_data[x0, y1, z0] +
            w011 * self.turbulence_data[x0, y1, z1] +
            w100 * self.turbulence_data[x1, y0, z0] +
            w101 * self.turbulence_data[x1, y0, z1] +
            w110 * self.turbulence_data[x1, y1, z0] +
            w111 * self.turbulence_data[x1, y1, z1]
        )

        return result

    # =========================================================================
    # GPU-Accelerated Methods (using CuPy if available)
    # =========================================================================

    def enable_gpu(self) -> bool:
        """
        Transfer wind field data to GPU for accelerated batch queries.

        Returns:
            True if GPU enabled, False if CuPy not available
        """
        if not CUPY_AVAILABLE:
            return False

        if not hasattr(self, '_gpu_wind_data'):
            self._gpu_wind_data = cp.asarray(self.wind_data)
            self._gpu_turbulence_data = cp.asarray(self.turbulence_data)

        return True

    def disable_gpu(self) -> None:
        """Release GPU memory."""
        if hasattr(self, '_gpu_wind_data'):
            del self._gpu_wind_data
            del self._gpu_turbulence_data
            if CUPY_AVAILABLE:
                cp.get_default_memory_pool().free_all_blocks()

    def get_wind_batch_gpu(self, positions: np.ndarray) -> np.ndarray:
        """
        GPU-accelerated batch wind vector interpolation.

        Args:
            positions: (N, 3) array of world positions (numpy array)

        Returns:
            (N, 3) array of wind vectors (numpy array)
        """
        if not CUPY_AVAILABLE or not hasattr(self, '_gpu_wind_data'):
            return self.get_wind_batch(positions)

        # Transfer positions to GPU
        positions_gpu = cp.asarray(positions)
        result_gpu = self._trilinear_interpolate_wind_batch_gpu(positions_gpu)

        # Transfer result back to CPU
        return cp.asnumpy(result_gpu)

    def get_turbulence_batch_gpu(self, positions: np.ndarray) -> np.ndarray:
        """
        GPU-accelerated batch turbulence interpolation.

        Args:
            positions: (N, 3) array of world positions (numpy array)

        Returns:
            (N,) array of turbulence values (numpy array)
        """
        if not CUPY_AVAILABLE or not hasattr(self, '_gpu_wind_data'):
            return self.get_turbulence_batch(positions)

        # Transfer positions to GPU
        positions_gpu = cp.asarray(positions)
        result_gpu = self._trilinear_interpolate_turbulence_batch_gpu(positions_gpu)

        # Transfer result back to CPU
        return cp.asnumpy(result_gpu)

    def _trilinear_interpolate_wind_batch_gpu(self, positions: 'cp.ndarray') -> 'cp.ndarray':
        """GPU-accelerated vectorized trilinear interpolation for wind vectors."""
        # Convert positions to grid indices
        bounds_min = cp.array([self.bounds_min.x, self.bounds_min.y, self.bounds_min.z])
        cell_sizes = cp.array([self.cell_size.x, self.cell_size.y, self.cell_size.z])
        cell_sizes = cp.where(cell_sizes > 0, cell_sizes, 1.0)

        rel = positions - bounds_min
        indices = rel / cell_sizes
        ix, iy, iz = indices[:, 0], indices[:, 1], indices[:, 2]

        # Clamp to valid range
        eps = 1e-6
        ix = cp.clip(ix, 0.0, float(self.nx - 1) - eps)
        iy = cp.clip(iy, 0.0, float(self.ny - 1) - eps)
        iz = cp.clip(iz, 0.0, float(self.nz - 1) - eps)

        # Get integer indices
        x0 = ix.astype(cp.int32)
        y0 = iy.astype(cp.int32)
        z0 = iz.astype(cp.int32)
        x1 = cp.minimum(x0 + 1, self.nx - 1)
        y1 = cp.minimum(y0 + 1, self.ny - 1)
        z1 = cp.minimum(z0 + 1, self.nz - 1)

        # Fractional parts
        xf = ix - x0
        yf = iy - y0
        zf = iz - z0

        # Weights
        w000 = (1 - xf) * (1 - yf) * (1 - zf)
        w001 = (1 - xf) * (1 - yf) * zf
        w010 = (1 - xf) * yf * (1 - zf)
        w011 = (1 - xf) * yf * zf
        w100 = xf * (1 - yf) * (1 - zf)
        w101 = xf * (1 - yf) * zf
        w110 = xf * yf * (1 - zf)
        w111 = xf * yf * zf

        # Gather and interpolate
        result = (
            w000[:, None] * self._gpu_wind_data[x0, y0, z0] +
            w001[:, None] * self._gpu_wind_data[x0, y0, z1] +
            w010[:, None] * self._gpu_wind_data[x0, y1, z0] +
            w011[:, None] * self._gpu_wind_data[x0, y1, z1] +
            w100[:, None] * self._gpu_wind_data[x1, y0, z0] +
            w101[:, None] * self._gpu_wind_data[x1, y0, z1] +
            w110[:, None] * self._gpu_wind_data[x1, y1, z0] +
            w111[:, None] * self._gpu_wind_data[x1, y1, z1]
        )

        return result

    def _trilinear_interpolate_turbulence_batch_gpu(self, positions: 'cp.ndarray') -> 'cp.ndarray':
        """GPU-accelerated vectorized trilinear interpolation for turbulence."""
        # Convert positions to grid indices
        bounds_min = cp.array([self.bounds_min.x, self.bounds_min.y, self.bounds_min.z])
        cell_sizes = cp.array([self.cell_size.x, self.cell_size.y, self.cell_size.z])
        cell_sizes = cp.where(cell_sizes > 0, cell_sizes, 1.0)

        rel = positions - bounds_min
        indices = rel / cell_sizes
        ix, iy, iz = indices[:, 0], indices[:, 1], indices[:, 2]

        # Clamp to valid range
        eps = 1e-6
        ix = cp.clip(ix, 0.0, float(self.nx - 1) - eps)
        iy = cp.clip(iy, 0.0, float(self.ny - 1) - eps)
        iz = cp.clip(iz, 0.0, float(self.nz - 1) - eps)

        # Get integer indices
        x0 = ix.astype(cp.int32)
        y0 = iy.astype(cp.int32)
        z0 = iz.astype(cp.int32)
        x1 = cp.minimum(x0 + 1, self.nx - 1)
        y1 = cp.minimum(y0 + 1, self.ny - 1)
        z1 = cp.minimum(z0 + 1, self.nz - 1)

        # Fractional parts
        xf = ix - x0
        yf = iy - y0
        zf = iz - z0

        # Weights
        w000 = (1 - xf) * (1 - yf) * (1 - zf)
        w001 = (1 - xf) * (1 - yf) * zf
        w010 = (1 - xf) * yf * (1 - zf)
        w011 = (1 - xf) * yf * zf
        w100 = xf * (1 - yf) * (1 - zf)
        w101 = xf * (1 - yf) * zf
        w110 = xf * yf * (1 - zf)
        w111 = xf * yf * zf

        # Gather and interpolate
        result = (
            w000 * self._gpu_turbulence_data[x0, y0, z0] +
            w001 * self._gpu_turbulence_data[x0, y0, z1] +
            w010 * self._gpu_turbulence_data[x0, y1, z0] +
            w011 * self._gpu_turbulence_data[x0, y1, z1] +
            w100 * self._gpu_turbulence_data[x1, y0, z0] +
            w101 * self._gpu_turbulence_data[x1, y0, z1] +
            w110 * self._gpu_turbulence_data[x1, y1, z0] +
            w111 * self._gpu_turbulence_data[x1, y1, z1]
        )

        return result

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
