"""
Visualize VTU wind field data using PyVista.

This script loads a VTU file containing CFD wind simulation data and
displays it as 3D vector glyphs (arrows) showing wind direction and magnitude.

Usage:
    python -m backend.data.visualize_vtu [path_to_vtu_file]

If no path is provided, defaults to internal.vtu in the project root.
"""

import os
import sys
import pyvista as pv
import numpy as np


def visualize_vtu(vtu_path: str) -> None:
    """
    Load and visualize a VTU file with wind vectors.

    Args:
        vtu_path: Path to the VTU file
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
    velocity = mesh.point_data['U']  # shape: (N, 3)

    print("Points shape:", points.shape)
    print("Velocity shape:", velocity.shape)

    # Print bounds
    print(f"X bounds: [{points[:, 0].min():.1f}, {points[:, 0].max():.1f}]")
    print(f"Y bounds: [{points[:, 1].min():.1f}, {points[:, 1].max():.1f}]")
    print(f"Z bounds: [{points[:, 2].min():.1f}, {points[:, 2].max():.1f}]")

    # Print velocity stats
    speed = np.linalg.norm(velocity, axis=1)
    print(f"Speed range: [{speed.min():.2f}, {speed.max():.2f}] m/s")
    print(f"Mean speed: {speed.mean():.2f} m/s")

    # Example: access velocity of first point
    print("First velocity:", velocity[0])

    # Create a point dataset with vectors and draw arrow glyphs
    pdata = pv.PolyData(points)
    pdata['vectors'] = velocity

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

    visualize_vtu(vtu_path)


if __name__ == "__main__":
    main()
