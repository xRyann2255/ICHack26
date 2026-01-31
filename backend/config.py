"""
Configuration for the wind-aware drone routing system.

Centralized configuration that can be modified for different scenarios.
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class SceneConfig:
    """Scene/world configuration."""
    bounds_min: Tuple[float, float, float] = (0, 0, 0)
    bounds_max: Tuple[float, float, float] = (500, 500, 150)
    grid_resolution: float = 10.0  # meters between grid nodes


@dataclass
class WindConfig:
    """Wind field configuration."""
    base_wind: Tuple[float, float, float] = (8.0, 3.0, 0.0)  # m/s
    field_resolution: float = 5.0  # meters between wind samples
    altitude_factor: float = 0.02  # wind increase per meter altitude


@dataclass
class BuildingConfig:
    """Building generation configuration."""
    num_buildings: int = 8
    min_size: Tuple[float, float, float] = (20, 20, 30)
    max_size: Tuple[float, float, float] = (50, 50, 100)
    margin: float = 10.0  # margin from scene edges


@dataclass
class RoutingConfig:
    """Routing algorithm configuration."""
    weight_preset: str = "speed_priority"  # speed_priority, safety_priority, balanced
    capture_interval: int = 20  # exploration frame capture interval
    path_smoothing_points: int = 10  # points per segment for smoothing


@dataclass
class ScenarioConfig:
    """A single routing scenario."""
    start: Tuple[float, float, float]
    end: Tuple[float, float, float]
    name: Optional[str] = None


@dataclass
class DemoConfig:
    """Complete demo configuration."""
    scene: SceneConfig = field(default_factory=SceneConfig)
    wind: WindConfig = field(default_factory=WindConfig)
    buildings: BuildingConfig = field(default_factory=BuildingConfig)
    routing: RoutingConfig = field(default_factory=RoutingConfig)
    scenarios: List[ScenarioConfig] = field(default_factory=list)
    random_seed: int = 42
    output_dir: str = "data/output"

    def __post_init__(self):
        # Default scenarios if none provided
        if not self.scenarios:
            bmin = self.scene.bounds_min
            bmax = self.scene.bounds_max
            mid_z = (bmin[2] + bmax[2]) / 2

            self.scenarios = [
                # Corner to corner (diagonal)
                ScenarioConfig(
                    start=(bmin[0] + 20, bmin[1] + 20, mid_z),
                    end=(bmax[0] - 20, bmax[1] - 20, mid_z),
                    name="diagonal"
                ),
                # Against wind (hardest)
                ScenarioConfig(
                    start=(bmax[0] - 20, (bmin[1] + bmax[1]) / 2, mid_z),
                    end=(bmin[0] + 20, (bmin[1] + bmax[1]) / 2, mid_z),
                    name="against_wind"
                ),
                # With wind (easiest)
                ScenarioConfig(
                    start=(bmin[0] + 20, (bmin[1] + bmax[1]) / 2, mid_z),
                    end=(bmax[0] - 20, (bmin[1] + bmax[1]) / 2, mid_z),
                    name="with_wind"
                ),
            ]


# Preset configurations
PRESETS = {
    "demo": DemoConfig(),
    "small": DemoConfig(
        scene=SceneConfig(
            bounds_max=(200, 200, 80),
            grid_resolution=10.0
        ),
        buildings=BuildingConfig(num_buildings=4),
        wind=WindConfig(field_resolution=5.0),
    ),
    "large": DemoConfig(
        scene=SceneConfig(
            bounds_max=(1000, 1000, 200),
            grid_resolution=20.0
        ),
        buildings=BuildingConfig(num_buildings=20),
        wind=WindConfig(field_resolution=10.0),
    ),
}
