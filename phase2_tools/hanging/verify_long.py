import bpy, json, sys
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.geometry import convex_hull_2d
a = sys.argv[sys.argv.index('--')+1:]; pos = json.load(open(a[0]))
# 1) seams: any pair of verts coincident in the rest shape must stay coincident
names = list(pos.keys()); rest = []; fin = []
for n in names:
    o = bpy.data.objects[n]
    for i, v in enumerate(o.data.vertices): rest.append(o.matrix_world @ v.co); fin.append(Vector(pos[n][i]))
kd = KDTree(len(rest))
for i, p in enumerate(rest): kd.insert(p, i)
kd.balance()
gap = 0.0
for i, p in enumerate(rest):
    for co, j, d in kd.find_range(p, 1e-5):
        if j != i: gap = max(gap, (fin[i] - fin[j]).length)
# 2) long sleeve verts inside the torso (per-height convex hull, xy)
torso = [Vector(p) for n in ('shirt_out', 'Mesh_0046.001') for p in pos[n]]
def inside(p):
    pts = [(q.x, q.y) for q in torso if abs(q.z - p.z) < 0.01]
    if len(pts) < 6: return 0
    h = [pts[i] for i in convex_hull_2d(pts)]; d = 1e9
    for k in range(len(h)):
        x1, y1 = h[k]; x2, y2 = h[(k + 1) % len(h)]
        c = (x2 - x1) * (p.y - y1) - (y2 - y1) * (p.x - x1)
        if c < 0: return 0
        L = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        if L > 1e-9: d = min(d, c / L)
    return d
cnt, mx = 0, 0
for n in ('Mesh_0054', 'Mesh_0050'):
    for p in pos[n]:
        p = Vector(p)
        if p.z > max(q.z for q in torso) - 0.08: continue
        d = inside(p)
        if d > 0: cnt += 1; mx = max(mx, d)
print('VERIFY seam_gap_mm=%.3f long_inside=%d max_cm=%.2f' % (gap * 1000, cnt, mx * 100))
