"""
Dijkstra's algorithm for wind-aware pathfinding.

Finds optimal paths using pre-computed edge costs that account for
wind direction and turbulence.
"""

from __future__ import annotations
import heapq
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from ..grid.node import Vector3, GridNode
from ..grid.grid_3d import Grid3D
from .cost_calculator import CostCalculator


@dataclass
class ExplorationFrame:
    """
    Snapshot of algorithm state for visualization.

    Used to animate the pathfinding process in the frontend.
    """
    step: int
    current_node_id: int
    current_position: List[float]
    visited_ids: List[int]
    frontier_ids: List[int]
    current_best_path: List[List[float]]  # Path to current node
    current_cost: float


@dataclass
class PathResult:
    """Result of pathfinding."""
    success: bool
    path: List[Vector3] = field(default_factory=list)
    path_node_ids: List[int] = field(default_factory=list)
    total_cost: float = float('inf')
    nodes_explored: int = 0
    exploration_frames: List[ExplorationFrame] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'success': self.success,
            'path': [p.to_list() for p in self.path],
            'path_node_ids': self.path_node_ids,
            'total_cost': self.total_cost,
            'nodes_explored': self.nodes_explored,
            'exploration_frames': [
                {
                    'step': f.step,
                    'current_node_id': f.current_node_id,
                    'current_position': f.current_position,
                    'visited_ids': f.visited_ids,
                    'frontier_ids': f.frontier_ids,
                    'current_best_path': f.current_best_path,
                    'current_cost': f.current_cost,
                }
                for f in self.exploration_frames
            ]
        }


class DijkstraRouter:
    """
    Dijkstra pathfinding with pre-computed wind-aware edge costs.

    Captures exploration history for visualization.
    """

    def __init__(
        self,
        grid: Grid3D,
        cost_calculator: CostCalculator,
        capture_interval: int = 20
    ):
        """
        Initialize router.

        Args:
            grid: 3D grid with nodes
            cost_calculator: Calculator with pre-computed edge costs
            capture_interval: Capture exploration frame every N steps
        """
        self.grid = grid
        self.cost_calculator = cost_calculator
        self.capture_interval = capture_interval

    def find_path(
        self,
        start: Vector3,
        end: Vector3,
        capture_exploration: bool = True
    ) -> PathResult:
        """
        Find optimal path from start to end.

        Args:
            start: Starting position (will snap to nearest grid node)
            end: Ending position (will snap to nearest grid node)
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

        # Run Dijkstra
        result = self._dijkstra(start_node, end_node, capture_exploration)

        # Replace first and last path positions with actual requested positions
        if result.success and result.path:
            result.path[0] = start
            result.path[-1] = end

        return result

    def _dijkstra(
        self,
        start_node: GridNode,
        end_node: GridNode,
        capture_exploration: bool
    ) -> PathResult:
        """
        Core Dijkstra implementation.
        """
        # Priority queue: (cost, node_id)
        # Using node_id as tiebreaker for deterministic behavior
        pq: List[Tuple[float, int]] = [(0.0, start_node.id)]

        # Cost to reach each node
        costs: Dict[int, float] = {start_node.id: 0.0}

        # Previous node in optimal path
        previous: Dict[int, int] = {}

        # Visited nodes
        visited: Set[int] = set()

        # Exploration history
        frames: List[ExplorationFrame] = []
        step = 0

        while pq:
            current_cost, current_id = heapq.heappop(pq)

            # Skip if already visited with better cost
            if current_id in visited:
                continue

            visited.add(current_id)
            current_node = self.grid.get_node_by_id(current_id)

            # Capture exploration frame
            if capture_exploration and step % self.capture_interval == 0:
                frame = self._capture_frame(
                    step, current_id, current_cost,
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
                        step, current_id, current_cost,
                        visited, pq, previous, start_node.id
                    )
                    frames.append(frame)

                return PathResult(
                    success=True,
                    path=path,
                    path_node_ids=path_ids,
                    total_cost=current_cost,
                    nodes_explored=len(visited),
                    exploration_frames=frames
                )

            # Explore neighbors
            for neighbor_id in self.grid.get_neighbor_ids(current_id):
                if neighbor_id in visited:
                    continue

                # Get edge cost
                edge_cost = self.cost_calculator.get_edge_cost(current_id, neighbor_id)
                if edge_cost is None:
                    continue  # Edge not valid (collision)

                new_cost = current_cost + edge_cost

                # Update if better path found
                if neighbor_id not in costs or new_cost < costs[neighbor_id]:
                    costs[neighbor_id] = new_cost
                    previous[neighbor_id] = current_id
                    heapq.heappush(pq, (new_cost, neighbor_id))

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
        pq: List[Tuple[float, int]],
        previous: Dict[int, int],
        start_id: int
    ) -> ExplorationFrame:
        """Capture current algorithm state for visualization."""
        current_node = self.grid.get_node_by_id(current_id)

        # Get frontier (nodes in priority queue)
        frontier_ids = list(set(node_id for _, node_id in pq if node_id not in visited))

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
