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

from ..grid.node import Vector3, GridNode
from ..grid.grid_3d import Grid3D

if TYPE_CHECKING:
    from ..data.wind_field import WindField
    from ..data.building_geometry import BuildingCollection


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
        progress_callback: Optional[callable] = None
    ) -> Dict[Tuple[int, int], float]:
        """
        Pre-compute costs for all valid edges in the grid.

        Args:
            grid: 3D grid with nodes
            buildings: Buildings for collision checking (optional)
            progress_callback: Called with (current, total) for progress

        Returns:
            Dictionary mapping (node_a_id, node_b_id) to cost
        """
        from ..grid.collision import CollisionChecker

        collision_checker = None
        if buildings:
            collision_checker = CollisionChecker(buildings)

        self._edge_costs = {}
        valid_nodes = list(grid.valid_nodes())
        total_nodes = len(valid_nodes)

        for i, node in enumerate(valid_nodes):
            if progress_callback and i % 100 == 0:
                progress_callback(i, total_nodes)

            for neighbor in grid.get_neighbors(node):
                # Skip if edge already computed (undirected check)
                # Note: We compute both directions because costs are direction-dependent!

                # Check collision if buildings provided
                if collision_checker:
                    if not collision_checker.node_edge_valid(node, neighbor):
                        continue

                # Compute cost for this direction
                cost = self.compute_edge_cost(node.position, neighbor.position)
                self._edge_costs[(node.id, neighbor.id)] = cost

        if progress_callback:
            progress_callback(total_nodes, total_nodes)

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
