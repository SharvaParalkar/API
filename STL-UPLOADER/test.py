from stl import mesh
import numpy as np

your_mesh = mesh.Mesh.from_file('test2.stl')

min_coords = np.min(your_mesh.vectors.reshape(-1, 3), axis=0)
max_coords = np.max(your_mesh.vectors.reshape(-1, 3), axis=0)
center = (min_coords + max_coords) / 2
size = max_coords - min_coords

print("Bounding Box Min:", min_coords)
print("Bounding Box Max:", max_coords)
print("Center Point:", center)
print("Size (mm):", size)
print("Triangle Count:", len(your_mesh.vectors))



