"""
Modular cost calculator for wind-aware edge costs.

This module is designed to be easily modified. To change cost calculation:
1. Modify existing CostComponent classes
2. Add new CostComponent subclasses
3. Adjust WeightConfig presets
4. Change how components are combined in CostCalculator
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, TYPE_CHECKING
import math
import numpy as np

from ..grid.node import Vector3, GridNode
from ..grid.grid_3d import Grid3D

if TYPE_CHECKING:
    from ..data.wind_field import WindField
    from ..data.building_geometry import BuildingCollection
    from ..data.stl_loader import STLMesh, MeshCollisionChecker


# =============================================================================
# Weight Configuration
# =============================================================================

@dataclass
class WeightConfig:
    """
    Configuration for cost component weights.

    Modify these presets or create new ones to change routing behavior.
    All weights should be non-negative. They are normalized internally.
    """
    distance: float = 1.0      # Base distance cost
    headwind: float = 1.0      # Penalty for flying into wind
    turbulence: float = 1.0    # Penalty for turbulent areas

    # Additional weights can be added here:
    # altitude: float = 0.0    # Prefer lower/higher altitude
    # energy: float = 0.0      # Energy consumption estimate

    def __post_init__(self):
        """Validate weights."""
        if self.distance < 0 or self.headwind < 0 or self.turbulence < 0:
            raise ValueError("Weights must be non-negative")

    @classmethod
    def speed_priority(cls) -> WeightConfig:
        """Minimize flight time by avoiding headwinds."""
        return cls(distance=0.3, headwind=0.6, turbulence=0.1)

    @classmethod
    def safety_priority(cls) -> WeightConfig:
        """Minimize crash risk by avoiding turbulence."""
        return cls(distance=0.2, headwind=0.2, turbulence=0.6)

    @classmethod
    def balanced(cls) -> WeightConfig:
        """Equal consideration of all factors."""
        return cls(distance=0.34, headwind=0.33, turbulence=0.33)

    @classmethod
    def distance_only(cls) -> WeightConfig:
        """Shortest path (for naive comparison)."""
        return cls(distance=1.0, headwind=0.0, turbulence=0.0)


# =============================================================================
# Cost Components (Modular)
# =============================================================================

class CostComponent(ABC):
    """
    Abstract base class for cost components.

    To create a new cost factor:
    1. Subclass CostComponent
    2. Implement compute() method
    3. Add to CostCalculator.components list
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique name for this cost component."""
        pass

    @abstractmethod
    def compute(
        self,
        start_pos: Vector3,
        end_pos: Vector3,
        wind_field: 'WindField',
        distance: float
    ) -> float:
        """
        Compute the cost contribution for an edge.

        Args:
            start_pos: Starting position of the edge
            end_pos: Ending position of the edge
            wind_field: Wind field for lookups
            distance: Pre-computed distance between positions

        Returns:
            Cost value (non-negative). Will be multiplied by weight.
        """
        pass


class DistanceCost(CostComponent):
    """
    Simple Euclidean distance cost.

    This is the baseline cost - longer paths cost more.
    """

    @property
    def name(self) -> str:
        return "distance"

    def compute(
        self,
        start_pos: Vector3,
        end_pos: Vector3,
        wind_field: 'WindField',
        distance: float
    ) -> float:
        return distance


class HeadwindCost(CostComponent):
    """
    Cost for flying into headwind.

    Headwind slows the drone and increases energy consumption.
    Tailwind provides a benefit (reduced cost).

    Modify this class to change how wind direction affects routing.
    """

    def __init__(self, tailwind_benefit: float = 0.5):
        """
        Args:
            tailwind_benefit: How much tailwind reduces cost (0-1).
                             0 = no benefit, 1 = full benefit
        """
        self.tailwind_benefit = tailwind_benefit

    @property
    def name(self) -> str:
        return "headwind"

    def compute(
        self,
        start_pos: Vector3,
        end_pos: Vector3,
        wind_field: 'WindField',
        distance: float
    ) -> float:
        if distance < 1e-6:
            return 0.0

        # Travel direction (normalized)
        travel_vec = end_pos - start_pos
        travel_dir = travel_vec.normalized()

        # Get wind at midpoint of edge
        midpoint = (start_pos + end_pos) * 0.5
        wind = wind_field.get_wind_at(midpoint)

        # Wind alignment: positive = tailwind, negative = headwind
        wind_alignment = wind.dot(travel_dir)

        if wind_alignment < 0:
            # Headwind: cost proportional to headwind strength * distance
            headwind_strength = -wind_alignment
            return headwind_strength * distance
        else:
            # Tailwind: reduce cost (but never negative)
            tailwind_strength = wind_alignment
            return -self.tailwind_benefit * tailwind_strength * distance


class TurbulenceCost(CostComponent):
    """
    Cost for flying through turbulent areas.

    High turbulence increases crash risk and requires more energy
    for stabilization.

    Modify this class to change turbulence sensitivity.
    """

    def __init__(self, threshold: float = 0.2, exponent: float = 2.0):
        """
        Args:
            threshold: Turbulence below this is considered safe (no extra cost)
            exponent: How sharply cost increases above threshold
        """
        self.threshold = threshold
        self.exponent = exponent

    @property
    def name(self) -> str:
        return "turbulence"

    def compute(
        self,
        start_pos: Vector3,
        end_pos: Vector3,
        wind_field: 'WindField',
        distance: float
    ) -> float:
        # Get turbulence at both endpoints and midpoint
        turb_start = wind_field.get_turbulence_at(start_pos)
        turb_end = wind_field.get_turbulence_at(end_pos)

        midpoint = (start_pos + end_pos) * 0.5
        turb_mid = wind_field.get_turbulence_at(midpoint)

        # Use maximum turbulence along edge
        max_turb = max(turb_start, turb_end, turb_mid)

        # Apply threshold and exponent
        if max_turb <= self.threshold:
            return 0.0

        excess = max_turb - self.threshold
        return (excess ** self.exponent) * distance


# =============================================================================
# Cost Calculator
# =============================================================================

@dataclass
class EdgeCost:
    """Detailed cost breakdown for an edge."""
    total: float
    components: Dict[str, float] = field(default_factory=dict)


class CostCalculator:
    """
    Computes and caches edge costs for pathfinding.

    To modify cost calculation:
    1. Change the components list in __init__
    2. Modify WeightConfig
    3. Override compute_edge_cost() for custom logic
    """

    def __init__(
        self,
        wind_field: 'WindField',
        weights: Optional[WeightConfig] = None,
        components: Optional[List[CostComponent]] = None
    ):
        """
        Initialize cost calculator.

        Args:
            wind_field: Wind field for cost calculations
            weights: Weight configuration (default: balanced)
            components: List of cost components (default: standard set)
        """
        self.wind_field = wind_field
        self.weights = weights or WeightConfig.balanced()

        # Default components - modify this list to change what factors are considered
        self.components = components or [
            DistanceCost(),
            HeadwindCost(tailwind_benefit=0.5),
            TurbulenceCost(threshold=0.2, exponent=2.0),
        ]

        # Build component lookup
        self._component_map = {c.name: c for c in self.components}

        # Cache for pre-computed edge costs
        self._edge_costs: Dict[Tuple[int, int], float] = {}

    def get_weight(self, component_name: str) -> float:
        """Get weight for a component by name."""
        return getattr(self.weights, component_name, 0.0)

    def compute_edge_cost(
        self,
        start_pos: Vector3,
        end_pos: Vector3,
        detailed: bool = False
    ) -> EdgeCost | float:
        """
        Compute cost for traveling from start to end.

        Args:
            start_pos: Starting position
            end_pos: Ending position
            detailed: If True, return EdgeCost with breakdown

        Returns:
            Total cost (float) or EdgeCost with component breakdown
        """
        distance = (end_pos - start_pos).magnitude()

        total = 0.0
        component_costs = {}

        for component in self.components:
            weight = self.get_weight(component.name)
            if weight == 0:
                continue

            cost = component.compute(start_pos, end_pos, self.wind_field, distance)
            weighted_cost = weight * cost
            total += weighted_cost

            if detailed:
                component_costs[component.name] = weighted_cost

        # Ensure non-negative total cost
        total = max(0.0, total)

        if detailed:
            return EdgeCost(total=total, components=component_costs)
        return total

    def precompute_edge_costs(
        self,
        grid: Grid3D,
        buildings: Optional['BuildingCollection'] = None,
        mesh: Optional['STLMesh'] = None,
        collision_checker: Optional['MeshCollisionChecker'] = None,
        progress_callback: Optional[callable] = None
    ) -> Dict[Tuple[int, int], float]:
        """
        Pre-compute costs for all valid edges in the grid.

        Args:
            grid: 3D grid with nodes
            buildings: Buildings for collision checking (AABB-based)
            mesh: STL mesh for collision checking (triangle-based, more accurate)
            collision_checker: Pre-built collision checker (preferred, avoids rebuilding voxel grid)
            progress_callback: Called with (current, total) for progress

        Returns:
            Dictionary mapping (node_a_id, node_b_id) to cost

        Note: If collision_checker is provided, it takes precedence over mesh/buildings.
        """
        import logging
        logger = logging.getLogger(__name__)

        from ..grid.collision import CollisionChecker
        from ..data.stl_loader import MeshCollisionChecker

        # Use provided collision checker, or create one
        if collision_checker is None:
            if mesh:
                logger.info("Building collision checker from mesh...")
                collision_checker = MeshCollisionChecker(mesh)
            elif buildings:
                collision_checker = CollisionChecker(buildings)

        self._edge_costs = {}
        valid_nodes = list(grid.valid_nodes())
        total_nodes = len(valid_nodes)

        logger.info(f"Pre-computing edge costs for {total_nodes} nodes...")
        last_log_pct = -10

        for i, node in enumerate(valid_nodes):
            if progress_callback and i % 100 == 0:
                progress_callback(i, total_nodes)

            # Log progress every 10%
            pct = (i * 100) // total_nodes
            if pct >= last_log_pct + 10:
                logger.info(f"  Edge cost progress: {pct}% ({i}/{total_nodes} nodes, {len(self._edge_costs)} edges)")
                last_log_pct = pct

            for neighbor in grid.get_neighbors(node):
                # Skip if edge already computed (undirected check)
                # Note: We compute both directions because costs are direction-dependent!

                # Check collision if collision checker provided
                if collision_checker:
                    if not collision_checker.node_edge_valid(node, neighbor):
                        continue

                # Compute cost for this direction
                cost = self.compute_edge_cost(node.position, neighbor.position)
                self._edge_costs[(node.id, neighbor.id)] = cost

        if progress_callback:
            progress_callback(total_nodes, total_nodes)

        logger.info(f"Edge cost computation complete: {len(self._edge_costs)} valid edges")
        return self._edge_costs

    def precompute_edge_costs_vectorized(
        self,
        grid: Grid3D,
        buildings: Optional['BuildingCollection'] = None,
        mesh: Optional['STLMesh'] = None,
        collision_checker: Optional['MeshCollisionChecker'] = None,
        progress_callback: Optional[callable] = None,
        batch_size: int = 50000,
        use_gpu: bool = True
    ) -> Dict[Tuple[int, int], float]:
        """
        Pre-compute costs for all valid edges using vectorized NumPy operations.

        This is significantly faster than the sequential version for large grids.

        Args:
            grid: 3D grid with nodes
            buildings: Buildings for collision checking (AABB-based)
            mesh: STL mesh for collision checking (triangle-based)
            collision_checker: Pre-built collision checker (preferred)
            progress_callback: Called with (current, total) for progress
            batch_size: Number of edges to process in each batch
            use_gpu: If True, attempt to use GPU acceleration (requires CuPy)

        Returns:
            Dictionary mapping (node_a_id, node_b_id) to cost
        """
        import logging
        import time
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

        # Step 1: Collect all potential edges and batch collision check
        logger.info("Collecting potential edges...")
        valid_nodes = list(grid.valid_nodes())
        total_nodes = len(valid_nodes)

        # First, collect ALL potential edges (without collision checking)
        potential_edges = []  # [(node_a_id, node_b_id, start_pos, end_pos), ...]

        for i, node in enumerate(valid_nodes):
            if progress_callback and i % 1000 == 0:
                progress_callback(i, total_nodes * 2)

            for neighbor in grid.get_neighbors(node):
                # Skip invalid nodes
                if not neighbor.is_valid:
                    continue
                potential_edges.append((
                    node.id,
                    neighbor.id,
                    [node.position.x, node.position.y, node.position.z],
                    [neighbor.position.x, neighbor.position.y, neighbor.position.z]
                ))

        logger.info(f"Collected {len(potential_edges)} potential edges")

        # Step 1b: Batch collision checking
        if collision_checker and len(potential_edges) > 0:
            logger.info("Running batch collision checking...")
            collision_start = time.time()

            # Check if batch method is available
            has_batch = hasattr(collision_checker, 'edges_valid_batch')

            if has_batch:
                # Use fast batch collision checking
                starts = np.array([e[2] for e in potential_edges], dtype=np.float64)
                ends = np.array([e[3] for e in potential_edges], dtype=np.float64)

                # Process in chunks to manage memory
                chunk_size = 100000
                valid_mask = np.zeros(len(potential_edges), dtype=bool)

                for chunk_start in range(0, len(potential_edges), chunk_size):
                    chunk_end = min(chunk_start + chunk_size, len(potential_edges))
                    valid_mask[chunk_start:chunk_end] = collision_checker.edges_valid_batch(
                        starts[chunk_start:chunk_end],
                        ends[chunk_start:chunk_end]
                    )
                    if progress_callback:
                        progress_callback(
                            total_nodes + (chunk_end * total_nodes // len(potential_edges)),
                            total_nodes * 2
                        )

                # Filter to valid edges only
                edge_list = [e for e, valid in zip(potential_edges, valid_mask) if valid]
                collision_time = time.time() - collision_start
                logger.info(f"Batch collision check: {len(edge_list)}/{len(potential_edges)} edges valid in {collision_time:.2f}s")
            else:
                # Fallback to sequential collision checking
                logger.info("Using sequential collision checking (batch not available)...")
                edge_list = []
                for i, edge in enumerate(potential_edges):
                    if progress_callback and i % 10000 == 0:
                        progress_callback(total_nodes + i * total_nodes // len(potential_edges), total_nodes * 2)

                    from ..grid.node import Vector3 as V3
                    start = V3(*edge[2])
                    end = V3(*edge[3])
                    if not collision_checker.edge_intersects_building(start, end):
                        edge_list.append(edge)
                collision_time = time.time() - collision_start
                logger.info(f"Sequential collision check: {len(edge_list)} valid in {collision_time:.2f}s")
        else:
            edge_list = potential_edges

        edge_collection_time = time.time() - start_time
        logger.info(f"Collected {len(edge_list)} valid edges in {edge_collection_time:.2f}s")

        if not edge_list:
            self._edge_costs = {}
            return self._edge_costs

        # Try to enable GPU if requested
        gpu_enabled = False
        if use_gpu:
            gpu_enabled = self.wind_field.enable_gpu()
            if gpu_enabled:
                logger.info("GPU acceleration enabled for wind field queries")
            else:
                logger.info("GPU not available, using CPU vectorization")

        # Step 2: Vectorized cost computation in batches
        logger.info(f"Computing edge costs in batches of {batch_size}...")
        batch_start_time = time.time()

        self._edge_costs = {}
        total_edges = len(edge_list)

        # Get weight values
        w_distance = self.get_weight("distance")
        w_headwind = self.get_weight("headwind")
        w_turbulence = self.get_weight("turbulence")

        # Get turbulence parameters from component
        turb_threshold = 0.2
        turb_exponent = 2.0
        tailwind_benefit = 0.5
        for comp in self.components:
            if comp.name == "turbulence":
                turb_threshold = getattr(comp, 'threshold', 0.2)
                turb_exponent = getattr(comp, 'exponent', 2.0)
            if comp.name == "headwind":
                tailwind_benefit = getattr(comp, 'tailwind_benefit', 0.5)

        for batch_start in range(0, total_edges, batch_size):
            batch_end = min(batch_start + batch_size, total_edges)
            batch = edge_list[batch_start:batch_end]
            batch_len = len(batch)

            if progress_callback:
                progress_callback(total_nodes + batch_start, total_nodes * 2)

            # Extract positions as numpy arrays
            start_positions = np.array([e[2] for e in batch], dtype=np.float64)
            end_positions = np.array([e[3] for e in batch], dtype=np.float64)

            # Compute midpoints
            midpoints = (start_positions + end_positions) * 0.5

            # Compute distances
            diff = end_positions - start_positions
            distances = np.sqrt(np.sum(diff ** 2, axis=1))

            # Compute travel directions (normalized)
            # Avoid division by zero for very short edges
            safe_distances = np.maximum(distances, 1e-6)
            travel_dirs = diff / safe_distances[:, np.newaxis]

            # Initialize total costs with distance component
            total_costs = np.zeros(batch_len, dtype=np.float64)
            if w_distance > 0:
                total_costs += w_distance * distances

            # Headwind cost (vectorized)
            if w_headwind > 0:
                # Get wind at midpoints (use GPU if available)
                if gpu_enabled:
                    wind_at_mid = self.wind_field.get_wind_batch_gpu(midpoints)
                else:
                    wind_at_mid = self.wind_field.get_wind_batch(midpoints)

                # Wind alignment: dot product of wind and travel direction
                # Positive = tailwind, Negative = headwind
                wind_alignment = np.sum(wind_at_mid * travel_dirs, axis=1)

                # Headwind: cost = -alignment * distance (when alignment < 0)
                # Tailwind: cost = -tailwind_benefit * alignment * distance (when alignment > 0)
                headwind_costs = np.where(
                    wind_alignment < 0,
                    -wind_alignment * distances,  # Headwind penalty
                    -tailwind_benefit * wind_alignment * distances  # Tailwind benefit (negative cost)
                )
                total_costs += w_headwind * headwind_costs

            # Turbulence cost (vectorized)
            if w_turbulence > 0:
                # Get turbulence at start, end, and midpoint (use GPU if available)
                if gpu_enabled:
                    turb_start = self.wind_field.get_turbulence_batch_gpu(start_positions)
                    turb_end = self.wind_field.get_turbulence_batch_gpu(end_positions)
                    turb_mid = self.wind_field.get_turbulence_batch_gpu(midpoints)
                else:
                    turb_start = self.wind_field.get_turbulence_batch(start_positions)
                    turb_end = self.wind_field.get_turbulence_batch(end_positions)
                    turb_mid = self.wind_field.get_turbulence_batch(midpoints)

                # Max turbulence along edge
                max_turb = np.maximum(np.maximum(turb_start, turb_end), turb_mid)

                # Apply threshold and exponent
                excess = np.maximum(0, max_turb - turb_threshold)
                turb_costs = (excess ** turb_exponent) * distances
                total_costs += w_turbulence * turb_costs

            # Ensure non-negative costs
            total_costs = np.maximum(0.0, total_costs)

            # Store results
            for idx, edge in enumerate(batch):
                self._edge_costs[(edge[0], edge[1])] = total_costs[idx]

        total_time = time.time() - start_time
        batch_time = time.time() - batch_start_time
        logger.info(f"Edge cost computation complete: {len(self._edge_costs)} edges in {total_time:.2f}s")
        logger.info(f"  - Edge collection: {edge_collection_time:.2f}s")
        logger.info(f"  - Batch cost computation: {batch_time:.2f}s")
        if gpu_enabled:
            logger.info(f"  - GPU acceleration: enabled")

        # Clean up GPU memory
        if gpu_enabled:
            self.wind_field.disable_gpu()

        if progress_callback:
            progress_callback(total_nodes * 2, total_nodes * 2)

        return self._edge_costs

    def get_edge_cost(self, node_a_id: int, node_b_id: int) -> Optional[float]:
        """Get pre-computed edge cost, or None if edge is invalid."""
        return self._edge_costs.get((node_a_id, node_b_id))

    @property
    def edge_count(self) -> int:
        """Number of pre-computed edges."""
        return len(self._edge_costs)

    def get_cost_statistics(self) -> Dict[str, float]:
        """Get statistics about pre-computed edge costs."""
        if not self._edge_costs:
            return {}

        costs = list(self._edge_costs.values())
        return {
            'min': min(costs),
            'max': max(costs),
            'mean': sum(costs) / len(costs),
            'count': len(costs)
        }
