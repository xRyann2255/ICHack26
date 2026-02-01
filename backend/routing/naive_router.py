"""
Naive A* router that ignores wind (distance-only).

Used as a comparison baseline to show the benefit of wind-aware routing.
"""

from __future__ import annotations
import heapq
from typing import Dict, List, Optional, Set, Tuple, TYPE_CHECKING

from ..grid.node import Vector3, GridNode
from ..grid.grid_3d import Grid3D
from .dijkstra import PathResult, ExplorationFrame

if TYPE_CHECKING:
    from ..data.building_geometry import BuildingCollection
    from ..data.stl_loader import STLMesh


class NaiveRouter:
    """
    A* pathfinding using only distance (ignores wind).

    This serves as the "naive" baseline for comparison with the
    wind-aware Dijkstra router. It finds the geometrically shortest
    path without considering wind conditions.
    """

    def __init__(
        self,
        grid: Grid3D,
        capture_interval: int = 20
    ):
        """
        Initialize naive router.

        Args:
            grid: 3D grid with nodes
            capture_interval: Capture exploration frame every N steps
        """
        self.grid = grid
        self.capture_interval = capture_interval

        # Pre-compute valid edges (collision-free)
        self._valid_edges: Set[Tuple[int, int]] = set()

    def precompute_valid_edges(
        self,
        buildings: Optional['BuildingCollection'] = None,
        mesh: Optional['STLMesh'] = None,
        collision_checker = None
    ) -> None:
        """
        Pre-compute which edges are valid (no collisions).

        Uses batch collision checking when available for much faster computation.

        Args:
            buildings: Buildings for collision checking (AABB-based)
            mesh: STL mesh for collision checking (triangle-based, more accurate)
            collision_checker: Pre-built collision checker (preferred, avoids rebuilding voxel grid)

        Note: If collision_checker is provided, it takes precedence.
        """
        import logging
        import time
        import numpy as np
        logger = logging.getLogger(__name__)

        from ..grid.collision import CollisionChecker
        from ..data.stl_loader import MeshCollisionChecker

        start_time = time.time()

        # Use provided collision checker, or create one
        if collision_checker is None:
            if mesh:
                logger.info("Building collision checker from mesh...")
                collision_checker = MeshCollisionChecker(mesh)
            elif buildings:
                collision_checker = CollisionChecker(buildings)

        self._valid_edges = set()
        valid_nodes = list(self.grid.valid_nodes())
        total_nodes = len(valid_nodes)

        logger.info(f"Pre-computing valid edges for naive router ({total_nodes} nodes)...")

        # First, collect ALL potential edges
        potential_edges = []
        for node in valid_nodes:
            for neighbor in self.grid.get_neighbors(node):
                if neighbor.is_valid:
                    potential_edges.append((
                        node.id,
                        neighbor.id,
                        [node.position.x, node.position.y, node.position.z],
                        [neighbor.position.x, neighbor.position.y, neighbor.position.z]
                    ))

        logger.info(f"  Collected {len(potential_edges)} potential edges")

        # Check if batch collision is available
        has_batch = collision_checker and hasattr(collision_checker, 'edges_valid_batch')

        if has_batch and len(potential_edges) > 0:
            # Use fast batch collision checking
            logger.info("  Using batch collision checking...")
            starts = np.array([e[2] for e in potential_edges], dtype=np.float64)
            ends = np.array([e[3] for e in potential_edges], dtype=np.float64)

            # Process in chunks
            chunk_size = 100000
            valid_mask = np.zeros(len(potential_edges), dtype=bool)

            for chunk_start in range(0, len(potential_edges), chunk_size):
                chunk_end = min(chunk_start + chunk_size, len(potential_edges))
                valid_mask[chunk_start:chunk_end] = collision_checker.edges_valid_batch(
                    starts[chunk_start:chunk_end],
                    ends[chunk_start:chunk_end]
                )

            # Add valid edges to set
            for edge, valid in zip(potential_edges, valid_mask):
                if valid:
                    self._valid_edges.add((edge[0], edge[1]))
        elif collision_checker:
            # Fallback to sequential
            logger.info("  Using sequential collision checking...")
            last_log_pct = -10
            for i, (node_a_id, node_b_id, start, end) in enumerate(potential_edges):
                pct = (i * 100) // len(potential_edges)
                if pct >= last_log_pct + 10:
                    logger.info(f"  Naive edge progress: {pct}% ({i}/{len(potential_edges)} edges)")
                    last_log_pct = pct

                from ..grid.node import Vector3 as V3
                if not collision_checker.edge_intersects_building(V3(*start), V3(*end)):
                    self._valid_edges.add((node_a_id, node_b_id))
        else:
            # No collision checking - all edges valid
            for edge in potential_edges:
                self._valid_edges.add((edge[0], edge[1]))

        elapsed = time.time() - start_time
        logger.info(f"Naive edge computation complete: {len(self._valid_edges)} valid edges in {elapsed:.2f}s")

    def precompute_valid_edges_parallel(
        self,
        buildings: Optional['BuildingCollection'] = None,
        mesh: Optional['STLMesh'] = None,
        collision_checker = None,
        num_workers: int = None
    ) -> None:
        """
        Pre-compute valid edges using parallel processing.

        Args:
            buildings: Buildings for collision checking (AABB-based)
            mesh: STL mesh for collision checking (triangle-based)
            collision_checker: Pre-built collision checker (preferred)
            num_workers: Number of parallel workers (default: CPU count)
        """
        import logging
        import time
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import os

        logger = logging.getLogger(__name__)

        from ..grid.collision import CollisionChecker
        from ..data.stl_loader import MeshCollisionChecker

        start_time = time.time()

        # Use provided collision checker, or create one
        if collision_checker is None:
            if mesh:
                logger.info("Building collision checker from mesh...")
                collision_checker = MeshCollisionChecker(mesh)
            elif buildings:
                collision_checker = CollisionChecker(buildings)

        self._valid_edges = set()
        valid_nodes = list(self.grid.valid_nodes())
        total_nodes = len(valid_nodes)

        if num_workers is None:
            num_workers = os.cpu_count() or 4

        logger.info(f"Pre-computing valid edges for naive router ({total_nodes} nodes, {num_workers} workers)...")

        # Process in chunks
        chunk_size = max(100, total_nodes // (num_workers * 4))
        chunks = [valid_nodes[i:i + chunk_size] for i in range(0, total_nodes, chunk_size)]

        def process_chunk(nodes):
            """Process a chunk of nodes and return valid edges."""
            chunk_edges = []
            for node in nodes:
                for neighbor in self.grid.get_neighbors(node):
                    if collision_checker:
                        if not collision_checker.node_edge_valid(node, neighbor):
                            continue
                    chunk_edges.append((node.id, neighbor.id))
            return chunk_edges

        # Process chunks in parallel
        all_edges = []
        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures = {executor.submit(process_chunk, chunk): i for i, chunk in enumerate(chunks)}
            completed = 0
            for future in as_completed(futures):
                chunk_edges = future.result()
                all_edges.extend(chunk_edges)
                completed += 1
                if completed % 10 == 0:
                    logger.info(f"  Chunk progress: {completed}/{len(chunks)} ({len(all_edges)} edges so far)")

        self._valid_edges = set(all_edges)

        elapsed = time.time() - start_time
        logger.info(f"Naive edge computation complete: {len(self._valid_edges)} valid edges in {elapsed:.2f}s")

    def _edge_valid(self, from_id: int, to_id: int) -> bool:
        """Check if an edge is valid."""
        if not self._valid_edges:
            # If not pre-computed, assume all edges between valid nodes are ok
            return True
        return (from_id, to_id) in self._valid_edges

    def _heuristic(self, node: GridNode, goal: GridNode) -> float:
        """
        A* heuristic: Euclidean distance to goal.

        This is admissible (never overestimates) for 3D grids.
        """
        return (goal.position - node.position).magnitude()

    def _edge_cost(self, from_node: GridNode, to_node: GridNode) -> float:
        """
        Edge cost: simple Euclidean distance.

        This ignores wind entirely - just geometric distance.
        """
        return (to_node.position - from_node.position).magnitude()

    def find_path(
        self,
        start: Vector3,
        end: Vector3,
        capture_exploration: bool = True
    ) -> PathResult:
        """
        Find shortest path from start to end (ignoring wind).

        Args:
            start: Starting position (snaps to nearest grid node)
            end: Ending position (snaps to nearest grid node)
            capture_exploration: Whether to capture frames for visualization

        Returns:
            PathResult with path and exploration history
        """
        # Find nearest grid nodes
        start_node = self.grid.get_node_at_position(start)
        end_node = self.grid.get_node_at_position(end)

        if not start_node or not start_node.is_valid:
            return PathResult(success=False)
        if not end_node or not end_node.is_valid:
            return PathResult(success=False)

        result = self._astar(start_node, end_node, capture_exploration)

        # Replace first and last path positions with actual requested positions
        if result.success and result.path:
            result.path[0] = start
            result.path[-1] = end

        return result

    def _astar(
        self,
        start_node: GridNode,
        end_node: GridNode,
        capture_exploration: bool
    ) -> PathResult:
        """
        Core A* implementation.
        """
        # Priority queue: (f_score, g_score, node_id)
        # f_score = g_score + heuristic
        # Using g_score as secondary sort for determinism
        start_h = self._heuristic(start_node, end_node)
        pq: List[Tuple[float, float, int]] = [(start_h, 0.0, start_node.id)]

        # Cost to reach each node (g_score)
        g_scores: Dict[int, float] = {start_node.id: 0.0}

        # Previous node in optimal path
        previous: Dict[int, int] = {}

        # Visited nodes (closed set)
        visited: Set[int] = set()

        # Exploration history
        frames: List[ExplorationFrame] = []
        step = 0

        while pq:
            f_score, g_score, current_id = heapq.heappop(pq)

            # Skip if already visited
            if current_id in visited:
                continue

            visited.add(current_id)
            current_node = self.grid.get_node_by_id(current_id)

            # Capture exploration frame
            if capture_exploration and step % self.capture_interval == 0:
                frame = self._capture_frame(
                    step, current_id, g_score,
                    visited, pq, previous, start_node.id
                )
                frames.append(frame)

            step += 1

            # Check if we reached the goal
            if current_id == end_node.id:
                path, path_ids = self._reconstruct_path(previous, start_node.id, end_node.id)

                # Capture final frame
                if capture_exploration:
                    frame = self._capture_frame(
                        step, current_id, g_score,
                        visited, pq, previous, start_node.id
                    )
                    frames.append(frame)

                return PathResult(
                    success=True,
                    path=path,
                    path_node_ids=path_ids,
                    total_cost=g_score,  # Total distance
                    nodes_explored=len(visited),
                    exploration_frames=frames
                )

            # Explore neighbors
            for neighbor in self.grid.get_neighbors(current_node):
                if neighbor.id in visited:
                    continue

                # Check if edge is valid
                if not self._edge_valid(current_id, neighbor.id):
                    continue

                # Calculate tentative g_score
                edge_cost = self._edge_cost(current_node, neighbor)
                tentative_g = g_score + edge_cost

                # Update if better path found
                if neighbor.id not in g_scores or tentative_g < g_scores[neighbor.id]:
                    g_scores[neighbor.id] = tentative_g
                    previous[neighbor.id] = current_id

                    h = self._heuristic(neighbor, end_node)
                    f = tentative_g + h
                    heapq.heappush(pq, (f, tentative_g, neighbor.id))

        # No path found
        return PathResult(
            success=False,
            nodes_explored=len(visited),
            exploration_frames=frames
        )

    def _reconstruct_path(
        self,
        previous: Dict[int, int],
        start_id: int,
        end_id: int
    ) -> Tuple[List[Vector3], List[int]]:
        """Reconstruct path from previous pointers."""
        path_ids = []
        current = end_id

        while current is not None:
            path_ids.append(current)
            current = previous.get(current)

        path_ids.reverse()

        # Convert to positions
        path = []
        for node_id in path_ids:
            node = self.grid.get_node_by_id(node_id)
            if node:
                path.append(node.position)

        return path, path_ids

    def _capture_frame(
        self,
        step: int,
        current_id: int,
        current_cost: float,
        visited: Set[int],
        pq: List[Tuple[float, float, int]],
        previous: Dict[int, int],
        start_id: int
    ) -> ExplorationFrame:
        """Capture current algorithm state for visualization."""
        current_node = self.grid.get_node_by_id(current_id)

        # Get frontier (nodes in priority queue)
        frontier_ids = list(set(node_id for _, _, node_id in pq if node_id not in visited))

        # Reconstruct current best path
        current_path = []
        node = current_id
        while node is not None:
            n = self.grid.get_node_by_id(node)
            if n:
                current_path.append(n.position.to_list())
            node = previous.get(node)
        current_path.reverse()

        return ExplorationFrame(
            step=step,
            current_node_id=current_id,
            current_position=current_node.position.to_list() if current_node else [0, 0, 0],
            visited_ids=list(visited),
            frontier_ids=frontier_ids,
            current_best_path=current_path,
            current_cost=current_cost
        )
