"""
Metrics calculator for comparing route performance.

Computes flight time, energy consumption, crash probability, and other
metrics that demonstrate the benefit of wind-aware routing.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Dict, TYPE_CHECKING

from ..grid.node import Vector3

if TYPE_CHECKING:
    from ..data.wind_field import WindField


@dataclass
class RouteMetrics:
    """
    Complete metrics for a route.

    All metrics are computed based on the path and wind field.
    """
    # Distance
    total_distance: float = 0.0  # meters

    # Time
    total_flight_time: float = 0.0  # seconds
    average_ground_speed: float = 0.0  # m/s

    # Energy
    energy_consumption: float = 0.0  # Watt-hours
    average_power: float = 0.0  # Watts

    # Safety
    crash_probability: float = 0.0  # percentage (0-100)
    max_turbulence_encountered: float = 0.0  # 0-1 scale
    max_wind_speed_encountered: float = 0.0  # m/s
    turbulence_zones_crossed: int = 0

    # Additional info
    path_points: int = 0
    headwind_segments: int = 0
    tailwind_segments: int = 0

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'total_distance': round(self.total_distance, 2),
            'total_flight_time': round(self.total_flight_time, 2),
            'average_ground_speed': round(self.average_ground_speed, 2),
            'energy_consumption': round(self.energy_consumption, 4),
            'average_power': round(self.average_power, 2),
            'crash_probability': round(self.crash_probability, 4),
            'max_turbulence_encountered': round(self.max_turbulence_encountered, 3),
            'max_wind_speed_encountered': round(self.max_wind_speed_encountered, 2),
            'turbulence_zones_crossed': self.turbulence_zones_crossed,
            'path_points': self.path_points,
            'headwind_segments': self.headwind_segments,
            'tailwind_segments': self.tailwind_segments,
        }

    def summary(self) -> str:
        """Human-readable summary."""
        return (
            f"Distance: {self.total_distance:.1f}m | "
            f"Time: {self.total_flight_time:.1f}s | "
            f"Energy: {self.energy_consumption:.2f}Wh | "
            f"Crash Risk: {self.crash_probability:.2f}%"
        )


@dataclass
class DroneParams:
    """
    Drone performance parameters.

    Modify these to change how metrics are calculated.
    """
    # Speed
    base_airspeed: float = 15.0  # m/s - drone's speed through air
    min_ground_speed: float = 1.0  # m/s - minimum forward progress

    # Power
    base_power: float = 100.0  # Watts - power for hovering/forward flight
    headwind_power_factor: float = 15.0  # Additional watts per m/s headwind
    turbulence_power_factor: float = 50.0  # Additional watts for stabilization

    # Safety thresholds
    max_safe_turbulence: float = 0.3  # Turbulence above this is dangerous
    max_safe_wind_speed: float = 20.0  # m/s - wind above this is dangerous
    turbulence_zone_threshold: float = 0.5  # For counting zones

    # Risk model parameters
    turbulence_risk_factor: float = 5.0  # Exponential factor
    wind_risk_factor: float = 0.5  # Exponential factor
    point_risk_scale: float = 0.001  # Risk accumulation per point


class MetricsCalculator:
    """
    Calculates route performance metrics.

    Uses wind field data and drone parameters to compute realistic
    estimates of flight time, energy, and safety metrics.
    """

    def __init__(
        self,
        wind_field: 'WindField',
        drone_params: DroneParams = None
    ):
        """
        Initialize calculator.

        Args:
            wind_field: Wind field for lookups
            drone_params: Drone performance parameters
        """
        self.wind_field = wind_field
        self.params = drone_params or DroneParams()

    def calculate(self, path: List[Vector3]) -> RouteMetrics:
        """
        Calculate all metrics for a path.

        Args:
            path: List of waypoints (Vector3)

        Returns:
            RouteMetrics with all computed values
        """
        if len(path) < 2:
            return RouteMetrics(path_points=len(path))

        metrics = RouteMetrics(path_points=len(path))

        # Calculate segment-by-segment metrics
        total_time = 0.0
        total_energy_ws = 0.0  # Watt-seconds
        crash_survival = 1.0  # Probability of NOT crashing
        in_turbulence_zone = False
        headwind_count = 0
        tailwind_count = 0

        for i in range(len(path) - 1):
            start = path[i]
            end = path[i + 1]

            # Segment geometry
            segment = end - start
            distance = segment.magnitude()
            if distance < 1e-6:
                continue

            direction = segment.normalized()
            metrics.total_distance += distance

            # Get wind at segment midpoint
            midpoint = (start + end) * 0.5
            wind = self.wind_field.get_wind_at(midpoint)
            turbulence = self.wind_field.get_turbulence_at(midpoint)

            wind_speed = wind.magnitude()
            metrics.max_wind_speed_encountered = max(
                metrics.max_wind_speed_encountered, wind_speed
            )
            metrics.max_turbulence_encountered = max(
                metrics.max_turbulence_encountered, turbulence
            )

            # Wind alignment (positive = tailwind, negative = headwind)
            wind_alignment = wind.dot(direction)

            if wind_alignment < 0:
                headwind_count += 1
            else:
                tailwind_count += 1

            # Ground speed calculation
            ground_speed = self.params.base_airspeed + wind_alignment
            ground_speed = max(self.params.min_ground_speed, ground_speed)

            # Flight time for segment
            segment_time = distance / ground_speed
            total_time += segment_time

            # Power calculation
            headwind = max(0, -wind_alignment)
            headwind_power = headwind * self.params.headwind_power_factor
            turbulence_power = turbulence * self.params.turbulence_power_factor

            segment_power = (
                self.params.base_power +
                headwind_power +
                turbulence_power
            )

            # Energy for segment (Watt-seconds)
            total_energy_ws += segment_power * segment_time

            # Crash probability calculation
            point_risk = self._calculate_point_risk(turbulence, wind_speed)
            crash_survival *= (1 - point_risk)

            # Turbulence zone counting
            if turbulence > self.params.turbulence_zone_threshold:
                if not in_turbulence_zone:
                    metrics.turbulence_zones_crossed += 1
                    in_turbulence_zone = True
            else:
                in_turbulence_zone = False

        # Finalize metrics
        metrics.total_flight_time = total_time
        metrics.energy_consumption = total_energy_ws / 3600  # Convert to Wh

        if total_time > 0:
            metrics.average_ground_speed = metrics.total_distance / total_time
            metrics.average_power = total_energy_ws / total_time

        # Crash probability (percentage)
        metrics.crash_probability = (1 - crash_survival) * 100

        metrics.headwind_segments = headwind_count
        metrics.tailwind_segments = tailwind_count

        return metrics

    def _calculate_point_risk(self, turbulence: float, wind_speed: float) -> float:
        """
        Calculate crash risk contribution from a single point.

        Based on exponential risk model from CLAUDE.md spec.
        """
        # Turbulence risk
        if turbulence > self.params.max_safe_turbulence:
            excess = turbulence - self.params.max_safe_turbulence
            turb_risk = 1 - math.exp(-self.params.turbulence_risk_factor * excess)
        else:
            turb_risk = 0

        # Wind speed risk
        if wind_speed > self.params.max_safe_wind_speed:
            excess = wind_speed - self.params.max_safe_wind_speed
            wind_risk = 1 - math.exp(-self.params.wind_risk_factor * excess)
        else:
            wind_risk = 0

        # Combined risk (assuming independence)
        point_risk = 1 - (1 - turb_risk) * (1 - wind_risk)

        # Scale down for accumulation
        return point_risk * self.params.point_risk_scale

    def compare(
        self,
        path_a: List[Vector3],
        path_b: List[Vector3],
        label_a: str = "Route A",
        label_b: str = "Route B"
    ) -> Dict:
        """
        Compare metrics between two paths.

        Returns a dictionary with both metrics and comparison ratios.
        """
        metrics_a = self.calculate(path_a)
        metrics_b = self.calculate(path_b)

        def safe_ratio(a: float, b: float) -> float:
            if b == 0:
                return float('inf') if a > 0 else 1.0
            return a / b

        return {
            label_a: metrics_a.to_dict(),
            label_b: metrics_b.to_dict(),
            'comparison': {
                'distance_ratio': safe_ratio(metrics_a.total_distance, metrics_b.total_distance),
                'time_ratio': safe_ratio(metrics_a.total_flight_time, metrics_b.total_flight_time),
                'energy_ratio': safe_ratio(metrics_a.energy_consumption, metrics_b.energy_consumption),
                'crash_risk_ratio': safe_ratio(metrics_a.crash_probability, metrics_b.crash_probability),
                'time_saved_seconds': metrics_a.total_flight_time - metrics_b.total_flight_time,
                'energy_saved_wh': metrics_a.energy_consumption - metrics_b.energy_consumption,
                'crash_risk_reduction_pct': metrics_a.crash_probability - metrics_b.crash_probability,
            }
        }
