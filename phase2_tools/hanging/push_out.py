"""Move sleeves out of the torso: per-height outward shift (whole sleeve cross-section moves together),
smoothed along height and faded to zero at the armhole seam."""
import bpy, json, sys, math
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.geometry import convex_hull_2d
a = sys.argv[sys.argv.index('--')+1:]
pos = json.load(open(a[0])); OUT = a[1]; sets = json.loads(a[2]); MARGIN = float(a[3]) if len(a) > 3 else 0.008
def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
torso = [Vector(p) for n in ('shirt_out', 'Mesh_0046.001') for p in pos[n]]
torso_rest = []
for n in ('shirt_out', 'Mesh_0046.001'):
    o = bpy.data.objects[n]; torso_rest += [o.matrix_world @ v.co for v in o.data.vertices]
kd_rest = KDTree(len(torso_rest))
for i, p in enumerate(torso_rest): kd_rest.insert(p, i)
kd_rest.balance()
hulls = {}
def hull(k):
    if k not in hulls:
        pts = [(p.x, p.y) for p in torso if abs(p.z - k * 0.01) < 0.012]
        hulls[k] = [pts[i] for i in convex_hull_2d(pts)] if len(pts) >= 6 else None
    return hulls[k]
def boundary_x(poly, y, side):
    xs = []
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y): xs.append(x1 + (x2 - x1) * (y - y1) / (y2 - y1))
    if not xs: return None
    return max(xs) if side > 0 else min(xs)
report = {}
for names, follow in sets:
    verts = []   # (name, index, Vector, seam_dist)
    for n in names:
        o = bpy.data.objects[n]; mw = o.matrix_world
        for i, v in enumerate(o.data.vertices):
            restp = mw @ v.co; verts.append((n, i, Vector(pos[n][i]), kd_rest.find(restp)[2]))
    seam_pts = [mw_p for (n, i, p, d) in verts if d < 0.001 for mw_p in [p]]
    kd_seam = KDTree(len(seam_pts))
    for k_, p in enumerate(seam_pts): kd_seam.insert(p, k_)
    kd_seam.balance()
    shift = {+1: {}, -1: {}}
    for (n, i, p, d) in verts:
        side = 1 if p.x > 0 else -1; k = round(p.z / 0.01); h = hull(k)
        if not h: continue
        bx = boundary_x(h, p.y, side)
        if bx is None: continue
        need = (bx + side * MARGIN - p.x) * side
        if need > 0: shift[side][k] = max(shift[side].get(k, 0.0), need)
    # smooth the per-height shift (max-filter then box blur) so the sleeve moves as a whole
    sm = {}
    for side in (1, -1):
        ks = shift[side]
        if not ks: sm[side] = {}; continue
        lo, hi = min(ks) - 6, max(ks) + 6
        mx = {k: max(ks.get(j, 0.0) for j in range(k - 2, k + 3)) for k in range(lo, hi + 1)}
        sm[side] = {k: sum(mx.get(j, 0.0) for j in range(k - 3, k + 4)) / 7 for k in range(lo, hi + 1)}
    moved = 0; maxs = 0
    out = {n: [list(p) for p in pos[n]] for n in names}
    def amount(p):
        side = 1 if p.x > 0 else -1; k = round(p.z / 0.01)
        w = smoothstep(0.0, 0.05, kd_seam.find(p)[2]) if seam_pts else 1.0
        return side, sm[side].get(k, 0.0) * w
    for (n, i, p, d) in verts:
        if d < 0.001: continue
        side, s = amount(p)
        if s > 0: out[n][i][0] = p.x + side * s; moved += 1; maxs = max(maxs, s)
    for fn in follow:   # e.g. Mesh_0052 cuff band follows the same shift
        out[fn] = [list(q) for q in pos[fn]]
        for i, q in enumerate(pos[fn]):
            side, s = amount(Vector(q))
            out[fn][i][0] = q[0] + side * s
    pos.update(out)
    report['+'.join(names)] = {'moved_verts': moved, 'max_shift_cm': round(maxs * 100, 1)}
json.dump(pos, open(OUT, 'w'))
print('PUSHOUT', json.dumps(report))
