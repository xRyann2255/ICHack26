"""3D grid structure for pathfinding."""

from __future__ import annotations
from typing import Dict, List, Optional, Tuple, Iterator
from .node import Vector3, GridNode


# 26-connectivity offsets (all adjacent cells including diagonals)
NEIGHBOR_OFFSETS = [
    (dx, dy, dz)
    for dx in (-1, 0, 1)
    for dy in (-1, 0, 1)
    for dz in (-1, 0, 1)
    if not (dx == 0 and dy == 0 and dz == 0)
]


class Grid3D:
    """3D grid for pathfinding with 26-connectivity."""

    def __init__(self, bounds_min: Vector3, bounds_max: Vector3,
                 resolution: float = 5.0):
        """
        Create a 3D grid.

        Args:
            bounds_min: Minimum corner of the grid volume
            bounds_max: Maximum corner of the grid volume
            resolution: Distance between grid nodes in meters
        """
        self.bounds_min = bounds_min
        self.bounds_max = bounds_max
        self.resolution = resolution

        # Calculate grid dimensions
        size = bounds_max - bounds_min
        self.nx = max(1, int(size.x / resolution) + 1)
        self.ny = max(1, int(size.y / resolution) + 1)
        self.nz = max(1, int(size.z / resolution) + 1)

        # Create nodes
        self.nodes: Dict[int, GridNode] = {}
        self._index_to_id: Dict[Tuple[int, int, int], int] = {}
        self._create_nodes()

    def _create_nodes(self) -> None:
        """Create all grid nodes."""
        node_id = 0
        for ix in range(self.nx):
            for iy in range(self.ny):
                for iz in range(self.nz):
                    position = Vector3(
                        self.bounds_min.x + ix * self.resolution,
                        self.bounds_min.y + iy * self.resolution,
                        self.bounds_min.z + iz * self.resolution
                    )
                    grid_index = (ix, iy, iz)
                    node = GridNode(node_id, position, grid_index)
                    self.nodes[node_id] = node
                    self._index_to_id[grid_index] = node_id
                    node_id += 1

    def get_node_by_id(self, node_id: int) -> Optional[GridNode]:
        """Get a node by its ID."""
        return self.nodes.get(node_id)

    def get_node_by_index(self, ix: int, iy: int, iz: int) -> Optional[GridNode]:
        """Get a node by its grid index."""
        node_id = self._index_to_id.get((ix, iy, iz))
        if node_id is not None:
            return self.nodes[node_id]
        return None

    def get_node_at_position(self, position: Vector3, prefer_valid: bool = True) -> Optional[GridNode]:
        """
        Get the nearest node to a world position.

        Args:
            position: World position to find nearest node for
            prefer_valid: If True, search for nearest valid node within a radius
        """
        # Calculate grid indices
        ix = round((position.x - self.bounds_min.x) / self.resolution)
        iy = round((position.y - self.bounds_min.y) / self.resolution)
        iz = round((position.z - self.bounds_min.z) / self.resolution)

        # Clamp to grid bounds
        ix = max(0, min(self.nx - 1, ix))
        iy = max(0, min(self.ny - 1, iy))
        iz = max(0, min(self.nz - 1, iz))

        node = self.get_node_by_index(ix, iy, iz)

        # If we want valid nodes and this one isn't valid, search nearby
        if prefer_valid and node and not node.is_valid:
            # Search in expanding radius for nearest valid node
            for radius in range(1, 6):  # Search up to 5 cells away
                best_node = None
                best_dist = float('inf')

                for dx in range(-radius, radius + 1):
                    for dy in range(-radius, radius + 1):
                        for dz in range(-radius, radius + 1):
                            # Only check nodes on the "shell" of this radius
                            if abs(dx) != radius and abs(dy) != radius and abs(dz) != radius:
                                continue

                            nix = ix + dx
                            niy = iy + dy
                            niz = iz + dz

                            if 0 <= nix < self.nx and 0 <= niy < self.ny and 0 <= niz < self.nz:
                                neighbor = self.get_node_by_index(nix, niy, niz)
                                if neighbor and neighbor.is_valid:
                                    dist = (neighbor.position - position).magnitude()
                                    if dist < best_dist:
                                        best_dist = dist
                                        best_node = neighbor

                if best_node:
                    return best_node

        return node

    def get_neighbors(self, node: GridNode) -> List[GridNode]:
        """Get all valid 26-connected neighbors of a node."""
        ix, iy, iz = node.grid_index
        neighbors = []

        for dx, dy, dz in NEIGHBOR_OFFSETS:
            nix, niy, niz = ix + dx, iy + dy, iz + dz

            # Check bounds
            if 0 <= nix < self.nx and 0 <= niy < self.ny and 0 <= niz < self.nz:
                neighbor = self.get_node_by_index(nix, niy, niz)
                if neighbor and neighbor.is_valid:
                    neighbors.append(neighbor)

        return neighbors

    def get_neighbor_ids(self, node_id: int) -> List[int]:
        """Get IDs of all valid 26-connected neighbors."""
        node = self.nodes.get(node_id)
        if not node:
            return []
        return [n.id for n in self.get_neighbors(node)]

    def mark_invalid(self, node_id: int) -> None:
        """Mark a node as invalid (inside a building)."""
        if node_id in self.nodes:
            self.nodes[node_id].is_valid = False

    def mark_nodes_in_volume(self, min_corner: Vector3, max_corner: Vector3,
                             is_valid: bool = False) -> None:
        """Mark all nodes within a volume as valid/invalid."""
        # Find grid index range
        min_ix = int((min_corner.x - self.bounds_min.x) / self.resolution)
        min_iy = int((min_corner.y - self.bounds_min.y) / self.resolution)
        min_iz = int((min_corner.z - self.bounds_min.z) / self.resolution)

        max_ix = int((max_corner.x - self.bounds_min.x) / self.resolution) + 1
        max_iy = int((max_corner.y - self.bounds_min.y) / self.resolution) + 1
        max_iz = int((max_corner.z - self.bounds_min.z) / self.resolution) + 1

        # Clamp to grid bounds
        min_ix = max(0, min_ix)
        min_iy = max(0, min_iy)
        min_iz = max(0, min_iz)
        max_ix = min(self.nx, max_ix)
        max_iy = min(self.ny, max_iy)
        max_iz = min(self.nz, max_iz)

        for ix in range(min_ix, max_ix):
            for iy in range(min_iy, max_iy):
                for iz in range(min_iz, max_iz):
                    node = self.get_node_by_index(ix, iy, iz)
                    if node:
                        node.is_valid = is_valid

    def valid_nodes(self) -> Iterator[GridNode]:
        """Iterate over all valid nodes."""
        for node in self.nodes.values():
            if node.is_valid:
                yield node

    @property
    def total_nodes(self) -> int:
        """Total number of nodes in the grid."""
        return len(self.nodes)

    @property
    def valid_node_count(self) -> int:
        """Number of valid nodes."""
        return sum(1 for n in self.nodes.values() if n.is_valid)

    def __repr__(self) -> str:
        return (f"Grid3D({self.nx}x{self.ny}x{self.nz}, "
                f"resolution={self.resolution}m, "
                f"valid={self.valid_node_count}/{self.total_nodes})")
