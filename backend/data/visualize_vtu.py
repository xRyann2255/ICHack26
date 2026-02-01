"""
Visualize VTU wind field data using PyVista.

Shows the raw wind vectors from an OpenFOAM VTU file.

Usage:
    python -m backend.data.visualize_vtu [path_to_vtu_file]
"""

import os
import sys
import pyvista as pv
import numpy as np


def load_vtu(vtu_path: str):
    """Load VTU file and extract points + velocity."""
    print(f"Loading: {vtu_path}")
    mesh = pv.read(vtu_path)

    print(f"\nMesh info:")
    print(f"  Type: {type(mesh).__name__}")
    print(f"  Points: {mesh.n_points:,}")
    print(f"  Cells: {mesh.n_cells:,}")
    print(f"  Point data: {list(mesh.point_data.keys())}")
    print(f"  Cell data: {list(mesh.cell_data.keys())}")

    # Get velocity - prefer cell_data (more common in OpenFOAM)
    if 'U' in mesh.cell_data:
        print("\nUsing cell_data['U']")
        points = mesh.cell_centers().points.copy()
        velocity = mesh.cell_data['U'].copy()
    elif 'U' in mesh.point_data:
        print("\nUsing point_data['U']")
        points = mesh.points.copy()
        velocity = mesh.point_data['U'].copy()
    else:
        raise KeyError(f"No 'U' field found")

    return points, velocity, mesh


def convert_to_scene_coords(points, velocity):
    """Convert from OpenFOAM (Z-up) to scene (Y-up) coordinates."""
    # OpenFOAM: X, Y, Z where Z is up
    # Scene: X, Y, Z where Y is up
    # Transform: scene_x = of_x, scene_y = of_z, scene_z = -of_y
    scene_points = np.column_stack([
        points[:, 0],
        points[:, 2],
        -points[:, 1],
    ])
    scene_velocity = np.column_stack([
        velocity[:, 0],
        velocity[:, 2],
        -velocity[:, 1],
    ])
    return scene_points, scene_velocity


def normalize_to_bounds(points, target_min, target_max):
    """Scale points to fit target bounds."""
    src_min = points.min(axis=0)
    src_max = points.max(axis=0)
    src_size = src_max - src_min
    tgt_size = target_max - target_min

    scale = np.where(src_size > 0.01, tgt_size / src_size, 1.0)
    offset = target_min - src_min * scale

    return points * scale + offset, scale, offset


def visualize_vtu(vtu_path: str):
    """Load and visualize VTU file."""
    if not os.path.exists(vtu_path):
        print(f"Error: File not found: {vtu_path}")
        sys.exit(1)

    # Load raw data
    points, velocity, mesh = load_vtu(vtu_path)

    print(f"\nShapes: points {points.shape}, velocity {velocity.shape}")

    # Show OpenFOAM bounds
    print(f"\n=== OpenFOAM Coordinates (Z-up) ===")
    print(f"X: [{points[:, 0].min():.1f}, {points[:, 0].max():.1f}]")
    print(f"Y: [{points[:, 1].min():.1f}, {points[:, 1].max():.1f}]")
    print(f"Z: [{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

    # Convert to scene coords
    points, velocity = convert_to_scene_coords(points, velocity)

    print(f"\n=== Scene Coordinates (Y-up) ===")
    print(f"X: [{points[:, 0].min():.1f}, {points[:, 0].max():.1f}]")
    print(f"Y: [{points[:, 1].min():.1f}, {points[:, 1].max():.1f}]")
    print(f"Z: [{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

    # Velocity stats
    speed = np.linalg.norm(velocity, axis=1)
    print(f"\n=== Velocity ===")
    print(f"Speed: [{speed.min():.2f}, {speed.max():.2f}] m/s")
    print(f"Mean: {speed.mean():.2f} m/s")

    # Sample mean direction
    nonzero = speed > 0.01
    if nonzero.sum() > 0:
        dirs = velocity[nonzero] / speed[nonzero, np.newaxis]
        mean_dir = dirs.mean(axis=0)
        mean_dir = mean_dir / np.linalg.norm(mean_dir)
        print(f"Mean direction: [{mean_dir[0]:.2f}, {mean_dir[1]:.2f}, {mean_dir[2]:.2f}]")

    # Create visualization
    print(f"\n=== Rendering {len(points):,} vectors ===")

    pdata = pv.PolyData(points)
    pdata['velocity'] = velocity
    pdata['speed'] = speed

    # Arrow scale - small arrows
    mean_speed = max(speed.mean(), 0.1)
    bounds_size = points.max(axis=0) - points.min(axis=0)
    avg_dim = bounds_size.mean()
    arrow_scale = (avg_dim * 0.005) / mean_speed

    print(f"Arrow scale: {arrow_scale:.6f}")

    glyphs = pdata.glyph(
        orient='velocity',
        scale='speed',
        factor=arrow_scale,
        geom=pv.Arrow(tip_length=0.25, tip_radius=0.1, shaft_radius=0.03)
    )

    # Plot
    plotter = pv.Plotter()

    # Bounding box
    bounds = [
        points[:, 0].min(), points[:, 0].max(),
        points[:, 1].min(), points[:, 1].max(),
        points[:, 2].min(), points[:, 2].max(),
    ]
    plotter.add_mesh(pv.Box(bounds=bounds), opacity=0.05, color='gray', show_edges=True)

    # Arrows
    plotter.add_mesh(
        glyphs,
        scalars='speed',
        cmap='coolwarm',
        show_scalar_bar=True,
        scalar_bar_args={'title': 'Speed (m/s)'}
    )

    plotter.add_axes()
    plotter.add_text(
        f"{os.path.basename(vtu_path)}\n"
        f"{len(points):,} vectors\n"
        f"Speed: {speed.min():.1f}-{speed.max():.1f} m/s",
        position='upper_left',
        font_size=10
    )

    plotter.show()


def main():
    if len(sys.argv) > 1:
        vtu_path = sys.argv[1]
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(script_dir))
        vtu_path = os.path.join(project_root, "internal.vtu")

    visualize_vtu(vtu_path)


if __name__ == "__main__":
    main()
