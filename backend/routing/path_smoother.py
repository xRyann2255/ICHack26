"""
Path smoothing using spline interpolation.

Converts discrete grid waypoints into smooth curves for visualization
and drone flight simulation.
"""

from __future__ import annotations
import numpy as np
from typing import List, Optional, Tuple
from scipy.interpolate import CubicSpline

from ..grid.node import Vector3


class PathSmoother:
    """
    Smooths paths using cubic spline interpolation.

    Takes a list of waypoints and produces a smooth curve that
    passes through (or near) the original points.
    """

    def __init__(self, points_per_segment: int = 10):
        """
        Initialize path smoother.

        Args:
            points_per_segment: Number of interpolated points between each
                               pair of original waypoints
        """
        self.points_per_segment = points_per_segment

    def smooth(
        self,
        path: List[Vector3],
        num_points: Optional[int] = None,
        preserve_endpoints: bool = True
    ) -> List[Vector3]:
        """
        Smooth a path using cubic spline interpolation.

        Args:
            path: List of waypoints (Vector3)
            num_points: Total number of output points (overrides points_per_segment)
            preserve_endpoints: Ensure first/last points match exactly

        Returns:
            Smoothed path as list of Vector3
        """
        if len(path) < 2:
            return path.copy()

        if len(path) == 2:
            # Just linear interpolation for 2 points
            return self._linear_interpolate(path[0], path[1], num_points or self.points_per_segment)

        # Extract x, y, z coordinates
        points = np.array([[p.x, p.y, p.z] for p in path])

        # Parameterize by cumulative chord length
        t = self._compute_parameter(points)

        # Create cubic splines for each dimension
        cs_x = CubicSpline(t, points[:, 0], bc_type='natural')
        cs_y = CubicSpline(t, points[:, 1], bc_type='natural')
        cs_z = CubicSpline(t, points[:, 2], bc_type='natural')

        # Generate output parameter values
        if num_points is None:
            num_points = (len(path) - 1) * self.points_per_segment + 1

        t_smooth = np.linspace(t[0], t[-1], num_points)

        # Evaluate splines
        x_smooth = cs_x(t_smooth)
        y_smooth = cs_y(t_smooth)
        z_smooth = cs_z(t_smooth)

        # Convert back to Vector3
        smoothed = [Vector3(x, y, z) for x, y, z in zip(x_smooth, y_smooth, z_smooth)]

        # Ensure exact endpoints if requested
        if preserve_endpoints and len(smoothed) >= 2:
            smoothed[0] = Vector3(path[0].x, path[0].y, path[0].z)
            smoothed[-1] = Vector3(path[-1].x, path[-1].y, path[-1].z)

        return smoothed

    def smooth_with_velocity(
        self,
        path: List[Vector3],
        num_points: Optional[int] = None
    ) -> Tuple[List[Vector3], List[Vector3]]:
        """
        Smooth path and compute velocity (tangent) at each point.

        Useful for determining drone heading along the path.

        Args:
            path: List of waypoints
            num_points: Total number of output points

        Returns:
            Tuple of (smoothed_path, velocities) where velocities are
            tangent vectors at each point
        """
        if len(path) < 2:
            return path.copy(), [Vector3(1, 0, 0)] * len(path)

        if len(path) == 2:
            direction = (path[1] - path[0]).normalized()
            smoothed = self._linear_interpolate(path[0], path[1], num_points or self.points_per_segment)
            velocities = [direction] * len(smoothed)
            return smoothed, velocities

        # Extract coordinates
        points = np.array([[p.x, p.y, p.z] for p in path])

        # Parameterize
        t = self._compute_parameter(points)

        # Create splines
        cs_x = CubicSpline(t, points[:, 0], bc_type='natural')
        cs_y = CubicSpline(t, points[:, 1], bc_type='natural')
        cs_z = CubicSpline(t, points[:, 2], bc_type='natural')

        # Generate parameter values
        if num_points is None:
            num_points = (len(path) - 1) * self.points_per_segment + 1

        t_smooth = np.linspace(t[0], t[-1], num_points)

        # Evaluate positions
        x_smooth = cs_x(t_smooth)
        y_smooth = cs_y(t_smooth)
        z_smooth = cs_z(t_smooth)

        # Evaluate derivatives (velocities)
        dx = cs_x(t_smooth, 1)  # First derivative
        dy = cs_y(t_smooth, 1)
        dz = cs_z(t_smooth, 1)

        # Convert to Vector3
        smoothed = [Vector3(x, y, z) for x, y, z in zip(x_smooth, y_smooth, z_smooth)]
        velocities = [Vector3(vx, vy, vz).normalized() for vx, vy, vz in zip(dx, dy, dz)]

        return smoothed, velocities

    def resample(
        self,
        path: List[Vector3],
        target_spacing: float
    ) -> List[Vector3]:
        """
        Resample path to have approximately uniform point spacing.

        Args:
            path: List of waypoints
            target_spacing: Desired distance between consecutive points (meters)

        Returns:
            Resampled path with uniform spacing
        """
        if len(path) < 2:
            return path.copy()

        # First smooth the path
        # Estimate number of points needed
        total_length = self._path_length(path)
        num_points = max(2, int(total_length / target_spacing) + 1)

        return self.smooth(path, num_points=num_points)

    def _compute_parameter(self, points: np.ndarray) -> np.ndarray:
        """
        Compute parameterization based on cumulative chord length.

        This gives better results than uniform parameterization when
        points are unevenly spaced.
        """
        # Compute distances between consecutive points
        diffs = np.diff(points, axis=0)
        distances = np.sqrt(np.sum(diffs ** 2, axis=1))

        # Cumulative sum for parameter values
        t = np.zeros(len(points))
        t[1:] = np.cumsum(distances)

        # Normalize to [0, 1] for numerical stability
        if t[-1] > 0:
            t = t / t[-1]

        return t

    def _linear_interpolate(
        self,
        start: Vector3,
        end: Vector3,
        num_points: int
    ) -> List[Vector3]:
        """Simple linear interpolation between two points."""
        if num_points < 2:
            return [start, end]

        result = []
        for i in range(num_points):
            t = i / (num_points - 1)
            p = start + (end - start) * t
            result.append(p)

        return result

    def _path_length(self, path: List[Vector3]) -> float:
        """Compute total path length."""
        total = 0.0
        for i in range(len(path) - 1):
            total += (path[i + 1] - path[i]).magnitude()
        return total


def compute_path_length(path: List[Vector3]) -> float:
    """Utility function to compute path length."""
    total = 0.0
    for i in range(len(path) - 1):
        total += (path[i + 1] - path[i]).magnitude()
    return total


def path_to_list(path: List[Vector3]) -> List[List[float]]:
    """Convert path to list of [x, y, z] for JSON serialization."""
    return [p.to_list() for p in path]
