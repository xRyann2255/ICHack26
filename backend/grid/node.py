"""Vector3 and GridNode classes for 3D grid representation."""

from __future__ import annotations
import math
from typing import Tuple


class Vector3:
    """3D vector with arithmetic operations."""

    __slots__ = ('x', 'y', 'z')

    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

    def __add__(self, other: Vector3) -> Vector3:
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: Vector3) -> Vector3:
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float) -> Vector3:
        return Vector3(self.x * scalar, self.y * scalar, self.z * scalar)

    def __rmul__(self, scalar: float) -> Vector3:
        return self.__mul__(scalar)

    def __truediv__(self, scalar: float) -> Vector3:
        return Vector3(self.x / scalar, self.y / scalar, self.z / scalar)

    def __neg__(self) -> Vector3:
        return Vector3(-self.x, -self.y, -self.z)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Vector3):
            return False
        return (abs(self.x - other.x) < 1e-9 and
                abs(self.y - other.y) < 1e-9 and
                abs(self.z - other.z) < 1e-9)

    def __hash__(self) -> int:
        return hash((round(self.x, 6), round(self.y, 6), round(self.z, 6)))

    def __repr__(self) -> str:
        return f"Vector3({self.x:.2f}, {self.y:.2f}, {self.z:.2f})"

    def dot(self, other: Vector3) -> float:
        """Dot product with another vector."""
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: Vector3) -> Vector3:
        """Cross product with another vector."""
        return Vector3(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x
        )

    def magnitude(self) -> float:
        """Length of the vector."""
        return math.sqrt(self.x ** 2 + self.y ** 2 + self.z ** 2)

    def magnitude_squared(self) -> float:
        """Squared length of the vector (faster, no sqrt)."""
        return self.x ** 2 + self.y ** 2 + self.z ** 2

    def normalized(self) -> Vector3:
        """Return unit vector in same direction."""
        mag = self.magnitude()
        if mag < 1e-9:
            return Vector3(0, 0, 0)
        return self / mag

    def to_tuple(self) -> Tuple[float, float, float]:
        """Convert to tuple."""
        return (self.x, self.y, self.z)

    def to_list(self) -> list:
        """Convert to list."""
        return [self.x, self.y, self.z]

    @classmethod
    def from_tuple(cls, t: Tuple[float, float, float]) -> Vector3:
        """Create from tuple."""
        return cls(t[0], t[1], t[2])

    @classmethod
    def from_list(cls, lst: list) -> Vector3:
        """Create from list."""
        return cls(lst[0], lst[1], lst[2])


class GridNode:
    """A node in the 3D grid."""

    __slots__ = ('id', 'position', 'grid_index', 'is_valid')

    def __init__(self, node_id: int, position: Vector3,
                 grid_index: Tuple[int, int, int], is_valid: bool = True):
        self.id = node_id
        self.position = position
        self.grid_index = grid_index  # (ix, iy, iz) in grid
        self.is_valid = is_valid  # False if inside a building

    def __repr__(self) -> str:
        status = "valid" if self.is_valid else "invalid"
        return f"GridNode({self.id}, {self.position}, {status})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, GridNode):
            return False
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)
