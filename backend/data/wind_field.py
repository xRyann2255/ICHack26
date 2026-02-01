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


from scipy.spatial import cKDTree 

class WindField:
    """
    Wind field storing arbitrary points and velocities.
    Uses nearest-neighbor search (octree or KD-tree) for queries.
    Turbulence is zero.
    """

    def __init__(self, points: np.ndarray, velocities: np.ndarray):
        """
        Args:
            points: (N,3) array of point positions
            velocities: (N,3) array of wind vectors
        """
        assert points.shape == velocities.shape, "Points and velocities must match"
        assert points.shape[1] == 3, "Points must be (N,3)"

        self.points = points.astype(np.float32)
        self.velocities = velocities.astype(np.float32)
        self.turbulence_data = np.zeros(len(points), dtype=np.float32)

        # Build a nearest neighbor structure (KD-tree can replace octree for simplicity)
        self._tree = cKDTree(self.points)

        # Bounding box
        self.bounds_min = Vector3(*points.min(axis=0))
        self.bounds_max = Vector3(*points.max(axis=0))

        self.n_points = len(points)

    # ------------------------
    # Single point queries
    # ------------------------
    def get_wind_at(self, position: Vector3) -> Vector3:
        """Get the nearest wind vector to a world position."""
        dist, idx = self._tree.query([position.x, position.y, position.z])
        vec = self.velocities[idx]
        return Vector3(vec[0], vec[1], vec[2])

    def get_turbulence_at(self, position: Vector3) -> float:
        """Return turbulence at a world position (always zero)."""
        _, idx = self._tree.query([position.x, position.y, position.z])
        return self.turbulence_data[idx]

    def get_wind_and_turbulence_at(self, position: Vector3) -> Tuple[Vector3, float]:
        """Return both wind vector and turbulence at a position."""
        _, idx = self._tree.query([position.x, position.y, position.z])
        vec = self.velocities[idx]
        return Vector3(vec[0], vec[1], vec[2]), self.turbulence_data[idx]

    # ------------------------
    # Batch queries
    # ------------------------
    def get_wind_batch(self, positions: np.ndarray) -> np.ndarray:
        """
        Get wind vectors at multiple positions.

        Args:
            positions: (M,3) array of world positions

        Returns:
            (M,3) array of wind vectors
        """
        _, idx = self._tree.query(positions)
        return self.velocities[idx]

    def get_turbulence_batch(self, positions: np.ndarray) -> np.ndarray:
        """
        Get turbulence at multiple positions (always zeros).

        Args:
            positions: (M,3) array of world positions

        Returns:
            (M,) array of turbulence values
        """
        _, idx = self._tree.query(positions)
        return self.turbulence_data[idx]

    # ------------------------
    # GPU support
    # ------------------------
    def enable_gpu(self) -> bool:
        """Transfer wind data to GPU."""
        if not CUPY_AVAILABLE:
            return False
        if not hasattr(self, "_gpu_velocities"):
            self._gpu_points = cp.asarray(self.points)
            self._gpu_velocities = cp.asarray(self.velocities)
            self._gpu_turbulence = cp.asarray(self.turbulence_data)
        return True

    def disable_gpu(self) -> None:
        if hasattr(self, "_gpu_velocities"):
            del self._gpu_points
            del self._gpu_velocities
            del self._gpu_turbulence
            if CUPY_AVAILABLE:
                cp.get_default_memory_pool().free_all_blocks()

    def get_wind_batch_gpu(self, positions: np.ndarray) -> np.ndarray:
        """GPU batch query (nearest neighbor)."""
        if not CUPY_AVAILABLE or not hasattr(self, "_gpu_velocities"):
            return self.get_wind_batch(positions)
        # naive approach: CPU KD-tree for indices, then GPU array lookup
        _, idx = self._tree.query(positions)
        return cp.asnumpy(self._gpu_velocities[idx])

    def get_turbulence_batch_gpu(self, positions: np.ndarray) -> np.ndarray:
        if not CUPY_AVAILABLE or not hasattr(self, "_gpu_turbulence"):
            return self.get_turbulence_batch(positions)
        _, idx = self._tree.query(positions)
        return cp.asnumpy(self._gpu_turbulence[idx])

    # ------------------------
    # Persistence
    # ------------------------
    def save_npz(self, filepath: str) -> None:
        np.savez_compressed(
            filepath,
            points=self.points,
            velocities=self.velocities,
            turbulence=self.turbulence_data
        )

    @classmethod
    def load_npz(cls, filepath: str) -> WindField:
        data = np.load(filepath)
        return cls(
            points=data["points"],
            velocities=data["velocities"]
        )

    # ------------------------
    # Utility
    # ------------------------
    def __repr__(self) -> str:
        return f"WindField({self.n_points} points, bounds={self.bounds_min} to {self.bounds_max})"
