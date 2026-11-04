"""Move follower objects by IDW of a simulated garment's displacement (rest -> final)."""
import bpy, sys, json
from mathutils import Vector
from mathutils.kdtree import KDTree
a = sys.argv[sys.argv.index('--')+1:]
tj = json.load(open(a[0])); names = json.loads(a[1]); src_filter = set(json.loads(a[2])); OUT = a[3]
idx = sorted({m for (n, i), m in zip(tj['src'], tj['mapping']) if n in src_filter})
R = [Vector(tj['rest'][m]) for m in idx]; F = [Vector(tj['final'][m]) for m in idx]
kd = KDTree(len(R))
for k, p in enumerate(R): kd.insert(p, k)
kd.balance(); out = {}
for n in names:
    o = bpy.data.objects[n]; mw = o.matrix_world; pts = []
    for v in o.data.vertices:
        p = mw @ v.co; acc = Vector(); ws = 0
        for co, k, d in kd.find_n(p, 8):
            w = 1.0 / (d ** 3 + 1e-9); acc += (F[k] - R[k]) * w; ws += w
        pts.append(list(p + acc / ws))
    out[n] = pts
json.dump(out, open(OUT, 'w')); print('FOLLOW done', names)
