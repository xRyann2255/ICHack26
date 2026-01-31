"""
Configuration for the wind-aware drone routing system.

Centralized configuration that can be modified for different scenarios.
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class SceneConfig:
    """Scene/world configuration.

    Coordinate system (Y-up, matches Three.js):
    - X: width (east-west)
    - Y: height (vertical/altitude)
    - Z: depth (north-south)
    """
    bounds_min: Tuple[float, float, float] = (0, 0, 0)
    bounds_max: Tuple[float, float, float] = (500, 150, 500)  # (x, y_height, z_depth)
    grid_resolution: float = 10.0  # meters between grid nodes


@dataclass
class WindConfig:
    """Wind field configuration.

    Wind vector is (vx, vy, vz) where Y is vertical.
    Base wind is primarily horizontal (X direction with some Z).
    """
    base_wind: Tuple[float, float, float] = (8.0, 0.0, 3.0)  # m/s (x, y_vertical, z_depth)
    field_resolution: float = 5.0  # meters between wind samples
    altitude_factor: float = 0.02  # wind increase per meter altitude (Y axis)


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
        # Coordinate system: X=width, Y=height(altitude), Z=depth
        if not self.scenarios:
            bmin = self.scene.bounds_min
            bmax = self.scene.bounds_max
            mid_y = (bmin[1] + bmax[1]) / 2  # Mid altitude (Y is vertical)

            self.scenarios = [
                # Corner to corner (diagonal)
                ScenarioConfig(
                    start=(bmin[0] + 20, mid_y, bmin[2] + 20),
                    end=(bmax[0] - 20, mid_y, bmax[2] - 20),
                    name="diagonal"
                ),
                # Against wind (hardest) - wind is primarily in +X direction
                ScenarioConfig(
                    start=(bmax[0] - 20, mid_y, (bmin[2] + bmax[2]) / 2),
                    end=(bmin[0] + 20, mid_y, (bmin[2] + bmax[2]) / 2),
                    name="against_wind"
                ),
                # With wind (easiest)
                ScenarioConfig(
                    start=(bmin[0] + 20, mid_y, (bmin[2] + bmax[2]) / 2),
                    end=(bmax[0] - 20, mid_y, (bmin[2] + bmax[2]) / 2),
                    name="with_wind"
                ),
            ]


# Preset configurations
# Bounds are (x_width, y_height, z_depth)
PRESETS = {
    "demo": DemoConfig(),
    "small": DemoConfig(
        scene=SceneConfig(
            bounds_max=(200, 80, 200),  # (x, y_height, z_depth)
            grid_resolution=10.0
        ),
        buildings=BuildingConfig(num_buildings=4),
        wind=WindConfig(field_resolution=5.0),
    ),
    "large": DemoConfig(
        scene=SceneConfig(
            bounds_max=(1000, 200, 1000),  # (x, y_height, z_depth)
            grid_resolution=20.0
        ),
        buildings=BuildingConfig(num_buildings=20),
        wind=WindConfig(field_resolution=10.0),
    ),
}
