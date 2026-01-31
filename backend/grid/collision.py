"""Collision detection for edges and buildings."""

from __future__ import annotations
from typing import TYPE_CHECKING
from .node import Vector3, GridNode

if TYPE_CHECKING:
    from ..data.building_geometry import BuildingCollection


class CollisionChecker:
    """Check for collisions between paths and buildings."""

    def __init__(self, buildings: BuildingCollection):
        self.buildings = buildings

    def point_in_building(self, point: Vector3) -> bool:
        """Check if a point is inside any building."""
        return self.buildings.contains_point(point)

    def edge_intersects_building(self, start: Vector3, end: Vector3,
                                 num_samples: int = 5) -> bool:
        """
        Check if an edge intersects any building.

        Uses ray marching with multiple sample points along the edge.
        """
        # Check endpoints first
        if self.point_in_building(start) or self.point_in_building(end):
            return True

        # Sample points along the edge
        for i in range(1, num_samples):
            t = i / num_samples
            point = start + (end - start) * t
            if self.point_in_building(point):
                return True

        return False

    def node_edge_valid(self, node_a: GridNode, node_b: GridNode) -> bool:
        """Check if an edge between two nodes is valid (no collision)."""
        if not node_a.is_valid or not node_b.is_valid:
            return False
        return not self.edge_intersects_building(node_a.position, node_b.position)
