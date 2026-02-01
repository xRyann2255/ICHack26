import sys
import numpy as np
import pyvista as pv

if len(sys.argv) < 2:
    print("Usage: python fix.py <input.vtu> [output.vtu]")
    sys.exit(1)

input_file = sys.argv[1]
output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace(".vtu", "_clipped.vtu")

mesh = pv.read(input_file)

print(f"Original mesh:")
print(f"  Cells: {mesh.n_cells}")
print(f"  Points: {mesh.n_points}")
print(f"  Bounds: {mesh.bounds}")

xmin, xmax = -500, 478.261
ymin, ymax = -775, 251.784
zmin, zmax = -6.930, 80.570

clipped = mesh.clip_box(
    bounds=[xmin, xmax, ymin, ymax, zmin, zmax],
    invert=False
)

print(f"\nClipped mesh:")
print(f"  Cells: {clipped.n_cells}")
print(f"  Points: {clipped.n_points}")
print(f"  Bounds: {clipped.bounds}")

clipped.save(output_file)
print(f"\nSaved: {output_file}")