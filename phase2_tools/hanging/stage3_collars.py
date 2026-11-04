import bpy, sys, json
from mathutils import Vector
from mathutils.kdtree import KDTree
a = sys.argv[sys.argv.index('--')+1:]
tj = json.load(open(a[0])); OUT = a[1]; K = int(a[2]) if len(a) > 2 else 12
trest = [Vector(p) for p in tj['rest']]; tfin = [Vector(p) for p in tj['final']]
kd = KDTree(len(trest))
for i, p in enumerate(trest): kd.insert(p, i)
kd.balance()
names = []
for i in range(1, 14):
    c = bpy.data.objects['collar_%d' % i]; names.append(c.name); names += [ch.name for ch in c.children]
out = {}; exact = {}
for n in names:
    o = bpy.data.objects[n]; mw = o.matrix_world; pts = []; ex = 0
    for v in o.data.vertices:
        p = mw @ v.co
        near = kd.find_n(p, K)
        if near[0][2] < 1e-5:
            pts.append(list(tfin[near[0][1]])); ex += 1; continue
        acc = Vector(); ws = 0
        for co, ti, d in near:
            w = 1.0 / (d ** 3 + 1e-9); acc += (tfin[ti] - trest[ti]) * w; ws += w
        pts.append(list(p + acc / ws))
    out[n] = pts; exact[n] = ex
json.dump(out, open(OUT, 'w'))
print('STAGE3 done', exact)
