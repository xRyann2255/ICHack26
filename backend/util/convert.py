import pyvista as pv
import numpy as np

# Load the internal mesh
mesh = pv.read("internal.vtu")
print(mesh)

# Get coordinates of points
points = mesh.points  # shape: (N, 3)

# Get velocity
velocity = mesh.point_data['U']  # shape: (N, 3)

print("Points shape:", points.shape)
print("Velocity shape:", velocity.shape)

# Example: access velocity of first point
print("First velocity:", velocity[0])

# Save as structured Python object if needed
data = {"points": points, "velocity": velocity}
print(data)
# Create a point dataset with vectors and draw arrow glyphs
pdata = pv.PolyData(points)
pdata['vectors'] = velocity

# scale arrows relative to mesh size
b = mesh.bounds  # (xmin,xmax,ymin,ymax,zmin,zmax)
diag = np.sqrt((b[1]-b[0])**2 + (b[3]-b[2])**2 + (b[5]-b[4])**2)
scale = diag * 0.03 if diag > 0 else 1.0

glyphs = pdata.glyph(orient='vectors', scale='vectors', factor=scale*0.1, geom=pv.Arrow())

# Visualize mesh and vector glyphs
plotter = pv.Plotter()
plotter.add_mesh(mesh, opacity=0.25, color='lightgray', show_edges=True)
plotter.add_mesh(glyphs, color='red')
plotter.add_axes()
plotter.add_bounding_box()
plotter.show()