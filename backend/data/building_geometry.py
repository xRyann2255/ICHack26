"""Building geometry for collision detection."""

from __future__ import annotations
import json
from typing import List, Dict, Any
from ..grid.node import Vector3


class Building:
    """Axis-aligned bounding box representing a building."""

    def __init__(self, min_corner: Vector3, max_corner: Vector3,
                 building_id: str = ""):
        self.min_corner = min_corner
        self.max_corner = max_corner
        self.id = building_id

    @property
    def center(self) -> Vector3:
        """Center point of the building."""
        return (self.min_corner + self.max_corner) * 0.5

    @property
    def size(self) -> Vector3:
        """Dimensions of the building."""
        return self.max_corner - self.min_corner

    def contains_point(self, point: Vector3) -> bool:
        """Check if a point is inside the building."""
        return (self.min_corner.x <= point.x <= self.max_corner.x and
                self.min_corner.y <= point.y <= self.max_corner.y and
                self.min_corner.z <= point.z <= self.max_corner.z)

    def intersects_segment(self, start: Vector3, end: Vector3) -> bool:
        """
        Check if a line segment intersects the building.

        Uses slab method for AABB-ray intersection.
        """
        direction = end - start
        length = direction.magnitude()
        if length < 1e-9:
            return self.contains_point(start)

        direction = direction / length

        # Check each axis
        tmin = 0.0
        tmax = length

        for axis in ['x', 'y', 'z']:
            p_min = getattr(self.min_corner, axis)
            p_max = getattr(self.max_corner, axis)
            p_start = getattr(start, axis)
            d = getattr(direction, axis)

            if abs(d) < 1e-9:
                # Ray parallel to slab
                if p_start < p_min or p_start > p_max:
                    return False
            else:
                t1 = (p_min - p_start) / d
                t2 = (p_max - p_start) / d

                if t1 > t2:
                    t1, t2 = t2, t1

                tmin = max(tmin, t1)
                tmax = min(tmax, t2)

                if tmin > tmax:
                    return False

        return True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'min': self.min_corner.to_list(),
            'max': self.max_corner.to_list()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Building:
        """Create from dictionary."""
        return cls(
            min_corner=Vector3.from_list(data['min']),
            max_corner=Vector3.from_list(data['max']),
            building_id=data.get('id', '')
        )

    def __repr__(self) -> str:
        return f"Building({self.id}, {self.min_corner} to {self.max_corner})"


class BuildingCollection:
    """Collection of buildings for efficient collision queries."""

    def __init__(self, buildings: List[Building] = None):
        self.buildings = buildings or []

    def add(self, building: Building) -> None:
        """Add a building to the collection."""
        self.buildings.append(building)

    def contains_point(self, point: Vector3) -> bool:
        """Check if a point is inside any building."""
        for building in self.buildings:
            if building.contains_point(point):
                return True
        return False

    def intersects_segment(self, start: Vector3, end: Vector3) -> bool:
        """Check if a segment intersects any building."""
        for building in self.buildings:
            if building.intersects_segment(start, end):
                return True
        return False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'buildings': [b.to_dict() for b in self.buildings]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> BuildingCollection:
        """Create from dictionary."""
        buildings = [Building.from_dict(b) for b in data.get('buildings', [])]
        return cls(buildings)

    def save_json(self, filepath: str) -> None:
        """Save buildings to JSON file."""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load_json(cls, filepath: str) -> BuildingCollection:
        """Load buildings from JSON file."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)

    def __len__(self) -> int:
        return len(self.buildings)

    def __iter__(self):
        return iter(self.buildings)

    def __repr__(self) -> str:
        return f"BuildingCollection({len(self.buildings)} buildings)"
