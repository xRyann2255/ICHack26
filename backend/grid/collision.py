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

    def edge_intersects_building(self, start: Vector3, end: Vector3) -> bool:
        """
        Check if an edge intersects any building.

        Uses proper AABB-segment intersection test.
        """
        return self.buildings.intersects_segment(start, end)

    def node_edge_valid(self, node_a: GridNode, node_b: GridNode) -> bool:
        """Check if an edge between two nodes is valid (no collision)."""
        if not node_a.is_valid or not node_b.is_valid:
            return False
        return not self.edge_intersects_building(node_a.position, node_b.position)
