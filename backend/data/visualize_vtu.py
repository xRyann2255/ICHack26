"""
Visualize VTU wind field data using PyVista.

This script loads a VTU file containing CFD wind simulation data and
displays it as 3D vector glyphs (arrows) showing wind direction and magnitude.

Usage:
    python -m backend.data.visualize_vtu [path_to_vtu_file] [max_arrows]

If no path is provided, defaults to internal.vtu in the project root.
max_arrows defaults to 10000 for smooth rendering.
"""

import os
import sys
import pyvista as pv
import numpy as np


def downsample_wind_field(points: np.ndarray, velocity: np.ndarray, max_arrows: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Downsample wind field by averaging vectors in spatial bins.

    Args:
        points: (N, 3) array of point positions
        velocity: (N, 3) array of velocity vectors
        max_arrows: Maximum number of arrows to render

    Returns:
        Tuple of (downsampled_points, downsampled_velocity)
    """
    n_points = len(points)

    if n_points <= max_arrows:
        return points, velocity

    # Calculate how many bins we need per dimension
    # We want roughly max_arrows total bins, so bins_per_dim^3 ≈ max_arrows
    bins_per_dim = int(np.ceil(max_arrows ** (1/3)))

    # Get bounds
    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    ranges = maxs - mins

    # Avoid division by zero for flat dimensions
    ranges = np.where(ranges == 0, 1, ranges)

    # Compute bin indices for each point
    normalized = (points - mins) / ranges  # 0 to 1
    bin_indices = np.clip((normalized * bins_per_dim).astype(int), 0, bins_per_dim - 1)

    # Create unique bin key for each point
    bin_keys = bin_indices[:, 0] + bin_indices[:, 1] * bins_per_dim + bin_indices[:, 2] * bins_per_dim * bins_per_dim

    # Find unique bins and average points/velocities within each
    unique_bins = np.unique(bin_keys)

    avg_points = []
    avg_velocities = []

    for bin_key in unique_bins:
        mask = bin_keys == bin_key
        avg_points.append(points[mask].mean(axis=0))
        avg_velocities.append(velocity[mask].mean(axis=0))

    return np.array(avg_points), np.array(avg_velocities)


def visualize_vtu(vtu_path: str, max_arrows: int = 10000) -> None:
    """
    Load and visualize a VTU file with wind vectors.

    Args:
        vtu_path: Path to the VTU file
        max_arrows: Maximum number of arrows to render (default 10000)
    """
    if not os.path.exists(vtu_path):
        print(f"Error: VTU file not found: {vtu_path}")
        sys.exit(1)

    print(f"Loading VTU file: {vtu_path}")

    # Load the internal mesh
    mesh = pv.read(vtu_path)
    print(mesh)

    # Get coordinates of points
    points = mesh.points  # shape: (N, 3)

    # Get velocity
    velocity = mesh.cell_data['U']  # shape: (N, 3)

    print("Original points shape:", points.shape)
    print("Original velocity shape:", velocity.shape)

    # Print bounds
    print(f"X bounds: [{points[:, 0].min():.1f}, {points[:, 0].max():.1f}]")
    print(f"Y bounds: [{points[:, 1].min():.1f}, {points[:, 1].max():.1f}]")
    print(f"Z bounds: [{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

    # Print velocity stats
    speed = np.linalg.norm(velocity, axis=1)
    print(f"Speed range: [{speed.min():.2f}, {speed.max():.2f}] m/s")
    print(f"Mean speed: {speed.mean():.2f} m/s")

    # Check if vectors are suspiciously uniform (all pointing same direction)
    nonzero_mask = speed > 0.01  # Ignore near-zero vectors
    if nonzero_mask.sum() > 0:
        nonzero_vel = velocity[nonzero_mask]
        nonzero_speed = speed[nonzero_mask]
        normalized = nonzero_vel / nonzero_speed[:, np.newaxis]

        # Compute mean direction
        mean_dir = normalized.mean(axis=0)
        mean_dir_norm = np.linalg.norm(mean_dir)

        # If mean direction has high magnitude, vectors are very aligned
        # (random directions would average to ~0, uniform directions average to ~1)
        if mean_dir_norm > 0.95:
            mean_dir_unit = mean_dir / mean_dir_norm
            print(f"\n⚠️  WARNING: Vectors are suspiciously uniform!")
            print(f"    Mean direction magnitude: {mean_dir_norm:.3f} (1.0 = all identical)")
            print(f"    Mean direction: [{mean_dir_unit[0]:.2f}, {mean_dir_unit[1]:.2f}, {mean_dir_unit[2]:.2f}]")
        else:
            # Also check variance of directions
            dir_std = normalized.std(axis=0)
            print(f"Direction variance: [{dir_std[0]:.3f}, {dir_std[1]:.3f}, {dir_std[2]:.3f}]")
            if dir_std.max() < 0.1:
                print(f"\n⚠️  WARNING: Very low direction variance - vectors may be too uniform!")

    # Downsample if needed
    n_points = len(points)
    if n_points > max_arrows:
        print(f"\nDownsampling from {n_points:,} to ~{max_arrows:,} arrows...")
        ds_points, ds_velocity = downsample_wind_field(points, velocity, max_arrows)
        print(f"Downsampled to {len(ds_points):,} arrows")
    else:
        ds_points, ds_velocity = points, velocity

    # Create a point dataset with vectors and draw arrow glyphs
    pdata = pv.PolyData(ds_points)
    pdata['vectors'] = ds_velocity

    # Scale arrows relative to mesh size
    b = mesh.bounds  # (xmin, xmax, ymin, ymax, zmin, zmax)
    diag = np.sqrt((b[1] - b[0])**2 + (b[3] - b[2])**2 + (b[5] - b[4])**2)
    scale = diag * 0.03 if diag > 0 else 1.0

    glyphs = pdata.glyph(
        orient='vectors',
        scale='vectors',
        factor=scale * 0.1,
        geom=pv.Arrow()
    )

    # Visualize mesh and vector glyphs
    plotter = pv.Plotter()
    plotter.add_mesh(mesh, opacity=0.25, color='lightgray', show_edges=True)
    plotter.add_mesh(glyphs, color='red')
    plotter.add_axes()
    plotter.add_bounding_box()
    plotter.show()


def main():
    """Main entry point."""
    # Determine VTU file path
    if len(sys.argv) > 1:
        vtu_path = sys.argv[1]
    else:
        # Default to internal.vtu in project root
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(script_dir))
        vtu_path = os.path.join(project_root, "internal.vtu")

    # Optional max_arrows parameter
    max_arrows = 10000  # Default
    if len(sys.argv) > 2:
        try:
            max_arrows = int(sys.argv[2])
        except ValueError:
            print(f"Warning: Invalid max_arrows '{sys.argv[2]}', using default {max_arrows}")

    print(f"Max arrows: {max_arrows:,}")
    visualize_vtu(vtu_path, max_arrows)


if __name__ == "__main__":
    main()
