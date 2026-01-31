"""
Drone flight simulator for visualization.

Simulates a drone flying through a wind field, computing position,
velocity, heading, and effort at each timestep. This data is used
by the frontend to animate the drone and show wind effects.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, TYPE_CHECKING

from ..grid.node import Vector3

if TYPE_CHECKING:
    from ..data.wind_field import WindField


@dataclass
class SimulationParams:
    """
    Parameters for flight simulation.

    Adjust these to change drone behavior.
    """
    # Speed
    max_airspeed: float = 15.0  # m/s - max speed through air
    min_airspeed: float = 5.0   # m/s - minimum airspeed to maintain
    acceleration: float = 3.0   # m/s² - how fast drone can change speed

    # Control
    max_turn_rate: float = 90.0  # degrees/s - how fast drone can turn
    waypoint_threshold: float = 5.0  # m - distance to consider waypoint reached

    # Simulation
    timestep: float = 0.1  # seconds per simulation step
    max_time: float = 600.0  # seconds - maximum simulation time

    # Effort calculation
    base_effort: float = 0.1  # Baseline effort for forward flight
    headwind_effort_factor: float = 0.05  # Effort per m/s headwind
    correction_effort_factor: float = 0.02  # Effort per degree correction


@dataclass
class DroneState:
    """Current state of the drone."""
    position: Vector3
    velocity: Vector3  # Ground-relative velocity
    heading: Vector3   # Unit vector - direction drone is pointing
    airspeed: float    # Speed relative to air
    target_waypoint_index: int = 0


@dataclass
class FlightFrame:
    """
    Single frame of flight data for visualization.

    Contains all information needed to render one moment of flight.
    """
    time: float                # Simulation time (seconds)
    position: Vector3          # World position
    velocity: Vector3          # Ground velocity
    heading: Vector3           # Drone heading (nose direction)
    wind: Vector3              # Wind at this position
    drift: Vector3             # Wind-induced drift vector
    correction: Vector3        # Correction the drone is applying
    effort: float              # 0-1 indicating how hard drone is working
    airspeed: float            # Speed relative to air
    groundspeed: float         # Speed relative to ground
    waypoint_index: int        # Current target waypoint
    distance_to_waypoint: float  # Distance to next waypoint

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'time': round(self.time, 3),
            'position': [round(x, 3) for x in self.position.to_list()],
            'velocity': [round(x, 3) for x in self.velocity.to_list()],
            'heading': [round(x, 3) for x in self.heading.to_list()],
            'wind': [round(x, 3) for x in self.wind.to_list()],
            'drift': [round(x, 3) for x in self.drift.to_list()],
            'correction': [round(x, 3) for x in self.correction.to_list()],
            'effort': round(self.effort, 3),
            'airspeed': round(self.airspeed, 2),
            'groundspeed': round(self.groundspeed, 2),
            'waypoint_index': self.waypoint_index,
            'distance_to_waypoint': round(self.distance_to_waypoint, 2),
        }


@dataclass
class FlightData:
    """
    Complete flight simulation data.

    Contains the full time-series and summary statistics.
    """
    frames: List[FlightFrame] = field(default_factory=list)
    total_time: float = 0.0
    total_distance: float = 0.0
    average_groundspeed: float = 0.0
    average_effort: float = 0.0
    max_effort: float = 0.0
    completed: bool = False
    waypoints_reached: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'frames': [f.to_dict() for f in self.frames],
            'summary': {
                'total_time': round(self.total_time, 2),
                'total_distance': round(self.total_distance, 2),
                'average_groundspeed': round(self.average_groundspeed, 2),
                'average_effort': round(self.average_effort, 3),
                'max_effort': round(self.max_effort, 3),
                'completed': self.completed,
                'waypoints_reached': self.waypoints_reached,
                'frame_count': len(self.frames),
            }
        }


class FlightSimulator:
    """
    Simulates drone flight through a wind field.

    The simulator models:
    - Drone trying to fly toward waypoints
    - Wind pushing the drone off course
    - Drone correcting heading to compensate ("crabbing")
    - Effort required to maintain course

    Output is used by the frontend to animate the drone.
    """

    def __init__(
        self,
        wind_field: 'WindField',
        params: Optional[SimulationParams] = None
    ):
        """
        Initialize simulator.

        Args:
            wind_field: Wind field for lookups
            params: Simulation parameters
        """
        self.wind_field = wind_field
        self.params = params or SimulationParams()

    def simulate(
        self,
        waypoints: List[Vector3],
        record_interval: int = 1
    ) -> FlightData:
        """
        Simulate drone flying along a path of waypoints.

        Args:
            waypoints: List of waypoints to follow
            record_interval: Record a frame every N simulation steps

        Returns:
            FlightData with complete time-series
        """
        if len(waypoints) < 2:
            return FlightData(completed=False)

        # Initialize state
        state = DroneState(
            position=Vector3(waypoints[0].x, waypoints[0].y, waypoints[0].z),
            velocity=Vector3(0, 0, 0),
            heading=self._direction_to(waypoints[0], waypoints[1]),
            airspeed=self.params.max_airspeed,
            target_waypoint_index=1
        )

        frames: List[FlightFrame] = []
        time = 0.0
        step = 0
        total_distance = 0.0
        total_effort = 0.0

        # Simulation loop
        while time < self.params.max_time:
            # Get current target
            if state.target_waypoint_index >= len(waypoints):
                # Reached final waypoint
                break

            target = waypoints[state.target_waypoint_index]

            # Get wind at current position
            wind = self.wind_field.get_wind_at(state.position)

            # Compute desired direction to target
            to_target = target - state.position
            distance_to_target = to_target.magnitude()

            # Check if we reached the waypoint
            if distance_to_target < self.params.waypoint_threshold:
                # Reached waypoint, move to next
                state.target_waypoint_index += 1
                # Check if we've completed the path
                if state.target_waypoint_index >= len(waypoints):
                    break
                # Update target to new waypoint and recalculate
                target = waypoints[state.target_waypoint_index]
                to_target = target - state.position
                distance_to_target = to_target.magnitude()

            desired_direction = to_target.normalized()

            # Compute required heading to counteract wind ("crabbing")
            # We want: heading * airspeed + wind = desired_direction * groundspeed
            heading, correction = self._compute_corrected_heading(
                desired_direction, wind, state.airspeed
            )

            # Update heading (with turn rate limit)
            state.heading = self._turn_toward(
                state.heading, heading, self.params.max_turn_rate * self.params.timestep
            )

            # Compute actual velocity
            air_velocity = state.heading * state.airspeed
            ground_velocity = air_velocity + wind
            groundspeed = ground_velocity.magnitude()

            # Compute drift (difference between where we're going and where we want to go)
            if groundspeed > 0.1:
                actual_direction = ground_velocity.normalized()
                drift = wind - (wind.dot(desired_direction) * desired_direction)
            else:
                actual_direction = desired_direction
                drift = Vector3(0, 0, 0)

            # Compute effort
            effort = self._compute_effort(wind, state.heading, correction)

            # Update position
            old_position = state.position
            state.position = state.position + ground_velocity * self.params.timestep
            state.velocity = ground_velocity

            # Track distance
            segment_distance = (state.position - old_position).magnitude()
            total_distance += segment_distance
            total_effort += effort

            # Record frame
            if step % record_interval == 0:
                frame = FlightFrame(
                    time=time,
                    position=Vector3(state.position.x, state.position.y, state.position.z),
                    velocity=Vector3(ground_velocity.x, ground_velocity.y, ground_velocity.z),
                    heading=Vector3(state.heading.x, state.heading.y, state.heading.z),
                    wind=Vector3(wind.x, wind.y, wind.z),
                    drift=drift,
                    correction=correction,
                    effort=effort,
                    airspeed=state.airspeed,
                    groundspeed=groundspeed,
                    waypoint_index=state.target_waypoint_index,
                    distance_to_waypoint=distance_to_target,
                )
                frames.append(frame)

            time += self.params.timestep
            step += 1

        # Compute summary statistics
        completed = state.target_waypoint_index >= len(waypoints)
        avg_effort = total_effort / max(1, step)
        max_effort = max((f.effort for f in frames), default=0.0)
        avg_groundspeed = total_distance / max(0.1, time)

        return FlightData(
            frames=frames,
            total_time=time,
            total_distance=total_distance,
            average_groundspeed=avg_groundspeed,
            average_effort=avg_effort,
            max_effort=max_effort,
            completed=completed,
            waypoints_reached=state.target_waypoint_index,
        )

    def _direction_to(self, from_pos: Vector3, to_pos: Vector3) -> Vector3:
        """Compute unit direction vector from one point to another."""
        diff = to_pos - from_pos
        mag = diff.magnitude()
        if mag < 1e-6:
            return Vector3(1, 0, 0)
        return diff / mag

    def _compute_corrected_heading(
        self,
        desired_direction: Vector3,
        wind: Vector3,
        airspeed: float
    ) -> tuple:
        """
        Compute the heading needed to achieve desired ground direction.

        This implements "crabbing" - pointing into the wind to maintain course.

        The physics: ground_velocity = heading * airspeed + wind
        We want ground_velocity to be in desired_direction.

        For perpendicular wind component w_perp:
        - We need heading to have component -w_perp/airspeed perpendicular to desired
        - This gives us: sin(crab_angle) = |w_perp| / airspeed

        If |w_perp| > airspeed, we can't fully compensate. In this case,
        we crab as much as possible while still making forward progress.

        Returns:
            Tuple of (corrected_heading, correction_vector)
        """
        wind_speed = wind.magnitude()

        if wind_speed < 0.1:
            # No significant wind, head directly toward target
            return desired_direction, Vector3(0, 0, 0)

        # Decompose wind into components parallel and perpendicular to desired direction
        wind_dot_desired = wind.dot(desired_direction)
        wind_parallel = desired_direction * wind_dot_desired
        wind_perpendicular = wind - wind_parallel
        perp_speed = wind_perpendicular.magnitude()

        if perp_speed < 0.1:
            # Wind is aligned with our direction (headwind or tailwind only)
            return desired_direction, Vector3(0, 0, 0)

        # Calculate the crab angle needed to counter perpendicular wind
        # sin(crab_angle) = perp_speed / airspeed
        # But we must ensure we still make forward progress

        # Maximum crab angle we'll allow (70 degrees) to ensure forward progress
        max_crab_angle = math.radians(70.0)
        max_sin = math.sin(max_crab_angle)

        # Calculate required sin of crab angle
        sin_crab = perp_speed / airspeed

        # Limit the crab angle to ensure forward progress
        if sin_crab > max_sin:
            sin_crab = max_sin

        # Crab angle
        crab_angle = math.asin(sin_crab)

        # Correction direction (into the perpendicular wind)
        correction_direction = (wind_perpendicular * -1).normalized()

        # Compute corrected heading using proper rotation
        # heading = desired * cos(crab) + correction_dir * sin(crab)
        cos_crab = math.cos(crab_angle)
        corrected = desired_direction * cos_crab + correction_direction * sin_crab
        corrected = corrected.normalized()

        # Correction vector for visualization (shows how much we're crabbing)
        correction_vector = correction_direction * sin_crab

        return corrected, correction_vector

    def _turn_toward(
        self,
        current: Vector3,
        target: Vector3,
        max_angle_degrees: float
    ) -> Vector3:
        """
        Turn current heading toward target, limited by max angle.

        Args:
            current: Current heading (unit vector)
            target: Target heading (unit vector)
            max_angle_degrees: Maximum turn angle in degrees

        Returns:
            New heading (unit vector)
        """
        # Compute angle between vectors
        dot = max(-1.0, min(1.0, current.dot(target)))
        angle = math.acos(dot)

        if angle < 1e-6:
            return target

        max_angle_rad = math.radians(max_angle_degrees)

        if angle <= max_angle_rad:
            return target

        # Interpolate toward target
        t = max_angle_rad / angle
        result = current * (1 - t) + target * t
        return result.normalized()

    def _compute_effort(
        self,
        wind: Vector3,
        heading: Vector3,
        correction: Vector3
    ) -> float:
        """
        Compute effort level (0-1) for visualization.

        Effort increases with:
        - Headwind strength (normalized by airspeed)
        - Amount of correction needed (normalized by max possible)
        """
        # Headwind component - normalize by max airspeed for proper scaling
        # A headwind equal to airspeed should be very high effort
        headwind = max(0.0, -wind.dot(heading))
        headwind_normalized = headwind / self.params.max_airspeed
        headwind_effort = headwind_normalized * 0.5  # Headwind can contribute up to 0.5

        # Correction effort - correction magnitude is typically 0-1 (sin of crab angle)
        # Max correction of 1.0 means we're at max crab angle
        correction_magnitude = min(1.0, correction.magnitude())
        correction_effort = correction_magnitude * 0.3  # Correction can contribute up to 0.3

        # Total effort (base + headwind + correction)
        # Base effort is for normal forward flight
        effort = self.params.base_effort + headwind_effort + correction_effort

        # Clamp to 0-1
        return min(1.0, max(0.0, effort))
