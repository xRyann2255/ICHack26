"""STL file loader for building geometry extraction.

Handles coordinate transformation from STL's Z-up to backend's Y-up system.

STL coordinate system (Z-up):
- X: east-west
- Y: north-south
- Z: altitude (up)

Backend coordinate system (Y-up, matches Three.js):
- X: east-west (same as STL)
- Y: altitude (was STL's Z)
- Z: north-south (was STL's Y)
"""

from __future__ import annotations
import struct
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass

from ..grid.node import Vector3
from .building_geometry import Building, BuildingCollection


def stl_to_backend_coords(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """
    Convert STL coordinates (Z-up) to backend coordinates (Y-up).

    This must match the frontend's Three.js transformation:
    - STL X → Backend X (unchanged)
    - STL Z → Backend Y (height/altitude)
    - STL Y → Backend -Z (depth, negated to match Three.js rotation)

    The frontend applies rotation=[-PI/2, 0, 0] which transforms:
    (x, y, z) → (x, z, -y)

    So we do the same here to ensure paths align with rendered terrain.
    """
    return (x, z, -y)


def backend_to_stl_coords(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """Convert backend coordinates (Y-up) to STL coordinates (Z-up)."""
    return (x, -z, y)


@dataclass
class Triangle:
    """A single triangle from the STL mesh (in backend Y-up coordinates)."""
    v0: np.ndarray  # First vertex [x, y, z] in backend coords
    v1: np.ndarray  # Second vertex [x, y, z] in backend coords
    v2: np.ndarray  # Third vertex [x, y, z] in backend coords
    normal: np.ndarray  # Normal vector [nx, ny, nz] in backend coords

    @property
    def min_bounds(self) -> np.ndarray:
        """Minimum corner of triangle's bounding box."""
        return np.minimum(np.minimum(self.v0, self.v1), self.v2)

    @property
    def max_bounds(self) -> np.ndarray:
        """Maximum corner of triangle's bounding box."""
        return np.maximum(np.maximum(self.v0, self.v1), self.v2)


class STLMesh:
    """
    STL mesh for collision detection.

    Uses a spatial grid to accelerate ray-triangle intersection tests.
    """

    def __init__(self, triangles: List[Triangle], cell_size: float = 20.0):
        """
        Initialize mesh with spatial indexing.

        Args:
            triangles: List of triangles from STL file
            cell_size: Size of spatial grid cells for acceleration
        """
        self.triangles = triangles
        self.cell_size = cell_size

        # Compute overall bounds
        if triangles:
            all_mins = np.array([t.min_bounds for t in triangles])
            all_maxs = np.array([t.max_bounds for t in triangles])
            self.min_bounds = np.min(all_mins, axis=0)
            self.max_bounds = np.max(all_maxs, axis=0)
        else:
            self.min_bounds = np.zeros(3)
            self.max_bounds = np.zeros(3)

        # Build spatial index
        self._build_spatial_index()

    def _build_spatial_index(self) -> None:
        """Build spatial grid for fast triangle lookup."""
        self.spatial_grid = {}

        for i, tri in enumerate(self.triangles):
            # Get cells this triangle overlaps
            min_cell = self._pos_to_cell(tri.min_bounds)
            max_cell = self._pos_to_cell(tri.max_bounds)

            # Add triangle index to all overlapping cells
            for cx in range(min_cell[0], max_cell[0] + 1):
                for cy in range(min_cell[1], max_cell[1] + 1):
                    for cz in range(min_cell[2], max_cell[2] + 1):
                        key = (cx, cy, cz)
                        if key not in self.spatial_grid:
                            self.spatial_grid[key] = []
                        self.spatial_grid[key].append(i)

    def _pos_to_cell(self, pos: np.ndarray) -> Tuple[int, int, int]:
        """Convert world position to cell coordinates."""
        cell = ((pos - self.min_bounds) / self.cell_size).astype(int)
        return tuple(cell)

    def segment_intersects(self, start: Vector3, end: Vector3) -> bool:
        """
        Check if a line segment intersects any triangle in the mesh.

        Args:
            start: Segment start point
            end: Segment end point

        Returns:
            True if segment intersects mesh
        """
        p0 = np.array([start.x, start.y, start.z])
        p1 = np.array([end.x, end.y, end.z])

        # Get cells along the ray path
        ray_dir = p1 - p0
        ray_len = np.linalg.norm(ray_dir)
        if ray_len < 1e-9:
            return self.point_inside(start)

        # Collect candidate triangles from cells along ray
        candidates = set()

        # Sample points along ray to get cells
        num_samples = max(2, int(ray_len / self.cell_size) + 1)
        for i in range(num_samples):
            t = i / (num_samples - 1) if num_samples > 1 else 0
            pos = p0 + t * ray_dir
            cell = self._pos_to_cell(pos)

            # Check this cell and neighbors
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    for dz in range(-1, 2):
                        key = (cell[0] + dx, cell[1] + dy, cell[2] + dz)
                        if key in self.spatial_grid:
                            candidates.update(self.spatial_grid[key])

        # Test actual intersection with candidate triangles
        for tri_idx in candidates:
            tri = self.triangles[tri_idx]
            if self._ray_triangle_intersect(p0, ray_dir, ray_len, tri):
                return True

        return False

    def _ray_triangle_intersect(
        self,
        ray_origin: np.ndarray,
        ray_dir: np.ndarray,
        max_t: float,
        tri: Triangle
    ) -> bool:
        """
        Moller-Trumbore ray-triangle intersection algorithm.

        Returns True if ray intersects triangle within [0, max_t].
        """
        EPSILON = 1e-9

        edge1 = tri.v1 - tri.v0
        edge2 = tri.v2 - tri.v0

        h = np.cross(ray_dir, edge2)
        a = np.dot(edge1, h)

        if abs(a) < EPSILON:
            return False  # Ray parallel to triangle

        f = 1.0 / a
        s = ray_origin - tri.v0
        u = f * np.dot(s, h)

        if u < 0.0 or u > 1.0:
            return False

        q = np.cross(s, edge1)
        v = f * np.dot(ray_dir, q)

        if v < 0.0 or u + v > 1.0:
            return False

        t = f * np.dot(edge2, q)

        return 0 <= t <= max_t

    def point_inside(self, point: Vector3) -> bool:
        """
        Check if a point is inside the mesh (approximate).

        Uses ray casting - count intersections with mesh.
        An odd count means inside.
        """
        # Cast ray in +X direction
        p = np.array([point.x, point.y, point.z])
        ray_dir = np.array([1.0, 0.0, 0.0])
        max_t = self.max_bounds[0] - p[0] + 100  # Extend beyond mesh

        count = 0
        cell = self._pos_to_cell(p)

        # Check triangles in cells along ray
        candidates = set()
        for cx in range(cell[0], int((self.max_bounds[0] - self.min_bounds[0]) / self.cell_size) + 2):
            for dy in range(-1, 2):
                for dz in range(-1, 2):
                    key = (cx, cell[1] + dy, cell[2] + dz)
                    if key in self.spatial_grid:
                        candidates.update(self.spatial_grid[key])

        for tri_idx in candidates:
            tri = self.triangles[tri_idx]
            if self._ray_triangle_intersect(p, ray_dir, max_t, tri):
                count += 1

        return count % 2 == 1


class STLLoader:
    """Load STL files and extract building geometry."""

    @staticmethod
    def load_binary_stl(
        filepath: str,
        convert_coords: bool = True,
        center_xy: bool = False,
        ground_at_zero: bool = True
    ) -> List[Triangle]:
        """
        Load a binary STL file.

        Binary STL format:
        - 80 bytes: header
        - 4 bytes: number of triangles (uint32)
        - For each triangle (50 bytes):
            - 12 bytes: normal (3 floats)
            - 36 bytes: 3 vertices (9 floats)
            - 2 bytes: attribute byte count

        Args:
            filepath: Path to STL file
            convert_coords: Convert from STL Z-up to backend Y-up
            center_xy: Center the mesh horizontally (X, Z in backend coords)
            ground_at_zero: Move mesh so ground level is at Y=0
        """
        raw_triangles = []

        with open(filepath, 'rb') as f:
            # Skip header
            f.read(80)

            # Read number of triangles
            num_triangles = struct.unpack('<I', f.read(4))[0]

            for _ in range(num_triangles):
                # Read normal
                normal = struct.unpack('<3f', f.read(12))

                # Read 3 vertices
                v0 = struct.unpack('<3f', f.read(12))
                v1 = struct.unpack('<3f', f.read(12))
                v2 = struct.unpack('<3f', f.read(12))

                # Skip attribute byte count
                f.read(2)

                raw_triangles.append((v0, v1, v2, normal))

        # Convert coordinates if needed
        triangles = []
        if convert_coords:
            for v0, v1, v2, normal in raw_triangles:
                # Convert from Z-up to Y-up: (x, y, z) -> (x, z, y)
                triangles.append(Triangle(
                    v0=np.array(stl_to_backend_coords(*v0), dtype=np.float32),
                    v1=np.array(stl_to_backend_coords(*v1), dtype=np.float32),
                    v2=np.array(stl_to_backend_coords(*v2), dtype=np.float32),
                    normal=np.array(stl_to_backend_coords(*normal), dtype=np.float32)
                ))
        else:
            for v0, v1, v2, normal in raw_triangles:
                triangles.append(Triangle(
                    v0=np.array(v0, dtype=np.float32),
                    v1=np.array(v1, dtype=np.float32),
                    v2=np.array(v2, dtype=np.float32),
                    normal=np.array(normal, dtype=np.float32)
                ))

        # Calculate bounds
        if triangles:
            all_verts = np.array([
                [t.v0, t.v1, t.v2] for t in triangles
            ]).reshape(-1, 3)
            min_bounds = all_verts.min(axis=0)
            max_bounds = all_verts.max(axis=0)

            # Apply centering and ground adjustment
            offset = np.zeros(3)

            if center_xy:
                center = (min_bounds + max_bounds) / 2
                offset[0] = -center[0]  # X
                offset[2] = -center[2]  # Z (depth in backend coords)

            if ground_at_zero:
                offset[1] = -min_bounds[1]  # Y (altitude in backend coords)

            if np.any(offset != 0):
                for tri in triangles:
                    tri.v0 += offset
                    tri.v1 += offset
                    tri.v2 += offset

        return triangles

    @staticmethod
    def load_stl(
        filepath: str,
        convert_coords: bool = True,
        center_xy: bool = True,
        ground_at_zero: bool = True,
        cell_size: float = 20.0
    ) -> STLMesh:
        """
        Load an STL file and create a mesh for collision detection.

        Args:
            filepath: Path to STL file
            convert_coords: Convert from STL Z-up to backend Y-up
            center_xy: Center the mesh horizontally
            ground_at_zero: Set ground level to Y=0
            cell_size: Spatial grid cell size for acceleration

        Returns:
            STLMesh ready for collision queries
        """
        triangles = STLLoader.load_binary_stl(
            filepath, convert_coords, center_xy, ground_at_zero
        )
        print(f"Loaded {len(triangles)} triangles from {filepath}")
        mesh = STLMesh(triangles, cell_size=cell_size)
        print(f"Mesh bounds: {mesh.min_bounds} to {mesh.max_bounds}")
        return mesh

    @staticmethod
    def mesh_to_buildings(
        mesh: STLMesh,
        grid_size: float = 10.0,
        min_height: float = 5.0
    ) -> BuildingCollection:
        """
        Convert mesh to building AABBs by voxelizing and extracting columns.

        This creates approximate AABBs for buildings by:
        1. Voxelizing the mesh at the given resolution
        2. Finding vertical columns of filled voxels
        3. Creating AABBs from those columns

        Args:
            mesh: STL mesh
            grid_size: Voxel grid resolution
            min_height: Minimum height to consider a building

        Returns:
            BuildingCollection with extracted building AABBs
        """
        # Determine grid dimensions
        size = mesh.max_bounds - mesh.min_bounds
        nx = max(1, int(size[0] / grid_size) + 1)
        ny = max(1, int(size[1] / grid_size) + 1)
        nz = max(1, int(size[2] / grid_size) + 1)

        print(f"Voxelizing mesh: {nx}x{ny}x{nz} grid")

        # Voxelize: mark cells that contain triangles
        occupied = np.zeros((nx, ny, nz), dtype=bool)

        for tri in mesh.triangles:
            # Get cells this triangle occupies
            min_cell = ((tri.min_bounds - mesh.min_bounds) / grid_size).astype(int)
            max_cell = ((tri.max_bounds - mesh.min_bounds) / grid_size).astype(int)

            min_cell = np.clip(min_cell, 0, [nx-1, ny-1, nz-1])
            max_cell = np.clip(max_cell, 0, [nx-1, ny-1, nz-1])

            occupied[
                min_cell[0]:max_cell[0]+1,
                min_cell[1]:max_cell[1]+1,
                min_cell[2]:max_cell[2]+1
            ] = True

        # Extract building columns (for Z-up coordinate system)
        # Find connected regions in XY plane and their Z extent
        buildings = []
        visited = np.zeros((nx, ny), dtype=bool)

        for ix in range(nx):
            for iy in range(ny):
                if visited[ix, iy]:
                    continue

                # Check if this column has any occupied voxels
                column = occupied[ix, iy, :]
                if not column.any():
                    continue

                # Find Z extent of this column
                z_indices = np.where(column)[0]
                z_min = z_indices.min()
                z_max = z_indices.max()
                height = (z_max - z_min + 1) * grid_size

                if height < min_height:
                    continue

                # Flood fill to find connected region in XY
                region = []
                stack = [(ix, iy)]
                visited[ix, iy] = True

                while stack:
                    cx, cy = stack.pop()
                    region.append((cx, cy))

                    # Check neighbors
                    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ncx, ncy = cx + dx, cy + dy
                        if 0 <= ncx < nx and 0 <= ncy < ny:
                            if not visited[ncx, ncy] and occupied[ncx, ncy, :].any():
                                visited[ncx, ncy] = True
                                stack.append((ncx, ncy))

                if len(region) < 2:  # Skip tiny regions
                    continue

                # Create AABB from region
                region_x = [r[0] for r in region]
                region_y = [r[1] for r in region]

                # Find overall Z extent for the region
                all_z_min = nz
                all_z_max = 0
                for rx, ry in region:
                    col = occupied[rx, ry, :]
                    z_idx = np.where(col)[0]
                    if len(z_idx) > 0:
                        all_z_min = min(all_z_min, z_idx.min())
                        all_z_max = max(all_z_max, z_idx.max())

                # Convert to world coordinates
                min_corner = Vector3(
                    mesh.min_bounds[0] + min(region_x) * grid_size,
                    mesh.min_bounds[1] + min(region_y) * grid_size,
                    mesh.min_bounds[2] + all_z_min * grid_size
                )
                max_corner = Vector3(
                    mesh.min_bounds[0] + (max(region_x) + 1) * grid_size,
                    mesh.min_bounds[1] + (max(region_y) + 1) * grid_size,
                    mesh.min_bounds[2] + (all_z_max + 1) * grid_size
                )

                buildings.append(Building(
                    min_corner=min_corner,
                    max_corner=max_corner,
                    building_id=f"building_{len(buildings)}"
                ))

        print(f"Extracted {len(buildings)} buildings from mesh")
        return BuildingCollection(buildings)

    @staticmethod
    def get_bounds(mesh: STLMesh) -> Tuple[Vector3, Vector3]:
        """Get world bounds of the mesh."""
        return (
            Vector3(*mesh.min_bounds),
            Vector3(*mesh.max_bounds)
        )


class VoxelGrid:
    """
    Fast voxel-based collision detection.

    Pre-computes which voxels are occupied by the mesh, enabling
    O(1) collision checks instead of O(n) triangle checks.
    """

    def __init__(self, mesh: STLMesh, voxel_size: float = 5.0):
        """
        Initialize voxel grid from mesh.

        Args:
            mesh: STL mesh to voxelize
            voxel_size: Size of each voxel in meters
        """
        self.voxel_size = voxel_size
        self.min_bounds = mesh.min_bounds.copy()
        self.max_bounds = mesh.max_bounds.copy()

        # Calculate grid dimensions
        size = self.max_bounds - self.min_bounds
        self.nx = max(1, int(np.ceil(size[0] / voxel_size)))
        self.ny = max(1, int(np.ceil(size[1] / voxel_size)))
        self.nz = max(1, int(np.ceil(size[2] / voxel_size)))

        print(f"Creating voxel grid: {self.nx}x{self.ny}x{self.nz} = {self.nx*self.ny*self.nz} voxels")

        # Create occupancy grid
        self.occupied = np.zeros((self.nx, self.ny, self.nz), dtype=bool)

        # Mark voxels that contain triangles
        for tri in mesh.triangles:
            # Get voxel range for this triangle
            tri_min = tri.min_bounds
            tri_max = tri.max_bounds

            ix_min = max(0, int((tri_min[0] - self.min_bounds[0]) / voxel_size))
            ix_max = min(self.nx - 1, int((tri_max[0] - self.min_bounds[0]) / voxel_size))
            iy_min = max(0, int((tri_min[1] - self.min_bounds[1]) / voxel_size))
            iy_max = min(self.ny - 1, int((tri_max[1] - self.min_bounds[1]) / voxel_size))
            iz_min = max(0, int((tri_min[2] - self.min_bounds[2]) / voxel_size))
            iz_max = min(self.nz - 1, int((tri_max[2] - self.min_bounds[2]) / voxel_size))

            self.occupied[ix_min:ix_max+1, iy_min:iy_max+1, iz_min:iz_max+1] = True

        occupied_count = np.sum(self.occupied)
        print(f"Voxel grid: {occupied_count} occupied ({100*occupied_count/(self.nx*self.ny*self.nz):.1f}%)")

    def _pos_to_voxel(self, pos: np.ndarray) -> Tuple[int, int, int]:
        """Convert position to voxel indices."""
        idx = ((pos - self.min_bounds) / self.voxel_size).astype(int)
        return tuple(np.clip(idx, 0, [self.nx-1, self.ny-1, self.nz-1]))

    def point_occupied(self, point: Vector3) -> bool:
        """Check if a point is in an occupied voxel."""
        pos = np.array([point.x, point.y, point.z])

        # Check bounds
        if np.any(pos < self.min_bounds) or np.any(pos > self.max_bounds):
            return False

        ix, iy, iz = self._pos_to_voxel(pos)
        return self.occupied[ix, iy, iz]

    def segment_intersects(self, start: Vector3, end: Vector3) -> bool:
        """
        Check if a line segment passes through any occupied voxel.

        Uses 3D DDA algorithm for efficient voxel traversal.
        """
        p0 = np.array([start.x, start.y, start.z])
        p1 = np.array([end.x, end.y, end.z])

        # Quick bounds check - if entirely above mesh, it's clear
        if min(p0[1], p1[1]) > self.max_bounds[1] + self.voxel_size:
            return False

        # If entirely outside XZ bounds, it's clear
        if (max(p0[0], p1[0]) < self.min_bounds[0] - self.voxel_size or
            min(p0[0], p1[0]) > self.max_bounds[0] + self.voxel_size or
            max(p0[2], p1[2]) < self.min_bounds[2] - self.voxel_size or
            min(p0[2], p1[2]) > self.max_bounds[2] + self.voxel_size):
            return False

        direction = p1 - p0
        length = np.linalg.norm(direction)
        if length < 1e-9:
            return self.point_occupied(start)

        # DDA (Digital Differential Analyzer) for voxel traversal
        # Sample at intervals smaller than voxel size
        step = self.voxel_size * 0.5
        num_steps = max(2, int(length / step) + 1)

        for i in range(num_steps):
            t = i / (num_steps - 1) if num_steps > 1 else 0
            pos = p0 + t * direction

            # Check bounds
            if np.any(pos < self.min_bounds) or np.any(pos > self.max_bounds):
                continue

            ix, iy, iz = self._pos_to_voxel(pos)
            if self.occupied[ix, iy, iz]:
                return True

        return False

    def segments_intersect_batch(
        self,
        starts: np.ndarray,
        ends: np.ndarray,
        num_samples_per_edge: int = 5
    ) -> np.ndarray:
        """
        Batch check if line segments pass through any occupied voxels.

        Uses vectorized operations for much faster collision checking
        when processing many edges.

        Args:
            starts: (N, 3) array of segment start points
            ends: (N, 3) array of segment end points
            num_samples_per_edge: Number of sample points per edge (default 5)

        Returns:
            (N,) boolean array, True if segment intersects occupied voxel
        """
        n_edges = len(starts)
        if n_edges == 0:
            return np.array([], dtype=bool)

        # Quick bounds check - entirely above mesh = clear
        min_y = np.minimum(starts[:, 1], ends[:, 1])
        above_mesh = min_y > self.max_bounds[1] + self.voxel_size

        # Quick bounds check - entirely outside XZ bounds = clear
        max_x = np.maximum(starts[:, 0], ends[:, 0])
        min_x = np.minimum(starts[:, 0], ends[:, 0])
        max_z = np.maximum(starts[:, 2], ends[:, 2])
        min_z = np.minimum(starts[:, 2], ends[:, 2])

        outside_xz = (
            (max_x < self.min_bounds[0] - self.voxel_size) |
            (min_x > self.max_bounds[0] + self.voxel_size) |
            (max_z < self.min_bounds[2] - self.voxel_size) |
            (min_z > self.max_bounds[2] + self.voxel_size)
        )

        # Edges that are clearly outside don't need detailed checking
        needs_checking = ~(above_mesh | outside_xz)
        results = np.zeros(n_edges, dtype=bool)

        if not np.any(needs_checking):
            return results

        # Get indices of edges that need checking
        check_indices = np.where(needs_checking)[0]
        check_starts = starts[check_indices]
        check_ends = ends[check_indices]
        n_check = len(check_indices)

        # Sample points along each edge
        # Shape: (n_check, num_samples, 3)
        t = np.linspace(0, 1, num_samples_per_edge).reshape(1, -1, 1)
        directions = (check_ends - check_starts).reshape(n_check, 1, 3)
        sample_points = check_starts.reshape(n_check, 1, 3) + t * directions

        # Flatten for batch voxel lookup: (n_check * num_samples, 3)
        flat_points = sample_points.reshape(-1, 3)

        # Convert to voxel indices (vectorized)
        voxel_coords = ((flat_points - self.min_bounds) / self.voxel_size).astype(np.int32)
        voxel_coords = np.clip(voxel_coords, 0, [self.nx - 1, self.ny - 1, self.nz - 1])

        # Check if points are within bounds
        in_bounds = (
            (flat_points[:, 0] >= self.min_bounds[0]) &
            (flat_points[:, 0] <= self.max_bounds[0]) &
            (flat_points[:, 1] >= self.min_bounds[1]) &
            (flat_points[:, 1] <= self.max_bounds[1]) &
            (flat_points[:, 2] >= self.min_bounds[2]) &
            (flat_points[:, 2] <= self.max_bounds[2])
        )

        # Look up occupancy for all points at once
        # Only check occupied status for in-bounds points
        occupied_flat = np.zeros(len(flat_points), dtype=bool)
        in_bounds_idx = np.where(in_bounds)[0]
        if len(in_bounds_idx) > 0:
            in_bounds_coords = voxel_coords[in_bounds_idx]
            occupied_flat[in_bounds_idx] = self.occupied[
                in_bounds_coords[:, 0],
                in_bounds_coords[:, 1],
                in_bounds_coords[:, 2]
            ]

        # Reshape back to (n_check, num_samples) and check if ANY sample is occupied
        occupied_per_edge = occupied_flat.reshape(n_check, num_samples_per_edge)
        edge_collides = np.any(occupied_per_edge, axis=1)

        # Store results back
        results[check_indices] = edge_collides

        return results


class MeshCollisionChecker:
    """Collision checker that uses voxelized STL mesh for fast queries."""

    def __init__(self, mesh: STLMesh, voxel_size: float = 5.0):
        """
        Initialize with an STL mesh.

        Args:
            mesh: STL mesh for collision detection
            voxel_size: Voxel size for occupancy grid (smaller = more accurate but slower to build)
        """
        self.mesh = mesh
        self.voxel_grid = VoxelGrid(mesh, voxel_size=voxel_size)

    def point_in_building(self, point: Vector3) -> bool:
        """Check if a point is inside the mesh (voxelized)."""
        return self.voxel_grid.point_occupied(point)

    def edge_intersects_building(self, start: Vector3, end: Vector3) -> bool:
        """Check if an edge intersects the mesh (voxelized)."""
        return self.voxel_grid.segment_intersects(start, end)

    def node_edge_valid(self, node_a, node_b) -> bool:
        """Check if an edge between two nodes is valid (no collision)."""
        if not node_a.is_valid or not node_b.is_valid:
            return False
        return not self.edge_intersects_building(node_a.position, node_b.position)

    def edges_valid_batch(
        self,
        starts: np.ndarray,
        ends: np.ndarray,
        num_samples: int = 5
    ) -> np.ndarray:
        """
        Batch check if edges are valid (no collision).

        Args:
            starts: (N, 3) array of edge start positions
            ends: (N, 3) array of edge end positions
            num_samples: Number of sample points per edge

        Returns:
            (N,) boolean array, True if edge is valid (no collision)
        """
        collides = self.voxel_grid.segments_intersect_batch(starts, ends, num_samples)
        return ~collides
