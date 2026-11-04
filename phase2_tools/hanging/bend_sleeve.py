"""Long sleeves: follow the torso near the armhole, then bend smoothly along the sleeve axis
so the sleeve hangs almost straight down beside the torso (slight outward tilt)."""
import bpy, json, sys, math
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
a = sys.argv[sys.argv.index('--')+1:]
pos = json.load(open(a[0])); P = json.loads(a[1]); OUT = a[2]
def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
names = ['Mesh_0054', 'Mesh_0050']
# torso rest/final for following
T_rest, T_fin = [], []
for n in ('shirt_out', 'Mesh_0046.001'):
    o = bpy.data.objects[n]
    T_rest += [o.matrix_world @ v.co for v in o.data.vertices]; T_fin += [Vector(p) for p in pos[n]]
kdt = KDTree(len(T_rest))
for i, p in enumerate(T_rest): kdt.insert(p, i)
kdt.balance()
verts = []
for n in names:
    o = bpy.data.objects[n]
    for i, v in enumerate(o.data.vertices): verts.append((n, i, o.matrix_world @ v.co))
# 1) follow the torso deformation (IDW) ; seam verts exact
p0 = []; seam = []
for k, (n, i, r) in enumerate(verts):
    near = kdt.find_n(r, 8)
    if near[0][2] < 0.001: p0.append(T_fin[near[0][1]].copy()); seam.append(k); continue
    acc = Vector(); ws = 0
    for co, ti, d in near:
        w = 1.0 / (d ** 3 + 1e-9); acc += (T_fin[ti] - T_rest[ti]) * w; ws += w
    p0.append(r + acc / ws)
kds = KDTree(len(seam))
for j, k in enumerate(seam): kds.insert(p0[k], j)
kds.balance()
seamset = set(seam)
out = {n: [None] * len(bpy.data.objects[n].data.vertices) for n in names}
info = {}
for side in (1, -1):
    idx = [k for k in range(len(verts)) if p0[k].x * side > 0]
    sidx = [k for k in idx if k in seamset]
    A = sum((p0[k] for k in sidx), Vector()) / len(sidx)
    # cuff centre: the 5% of verts farthest from the armhole centre
    far = sorted(idx, key=lambda k: (p0[k] - A).length)[-max(10, len(idx) // 20):]
    C = sum((p0[k] for k in far), Vector()) / len(far)
    d0 = (C - A).normalized()
    tau = math.radians(P['tilt_deg'])
    d1 = Vector((side * math.sin(tau), P.get('fwd', 0.0), -math.cos(tau))).normalized()
    axis = d0.cross(d1); Theta = d0.angle(d1); axis.normalize()
    s0, Lb = P['bend_start'], P['bend_len']
    # centre line by integrating the rotating direction
    step = 0.002; smax = max((p0[k] - A).dot(d0) for k in idx) + 0.05
    Cs = [A.copy()]; s = 0.0
    while s < smax:
        th = Theta * smoothstep(s0, s0 + Lb, s + step / 2)
        Cs.append(Cs[-1] + Matrix.Rotation(th, 3, axis) @ d0 * step); s += step
    def centre(s):
        if s <= 0: return A + d0 * s
        f = s / step; i0 = min(int(f), len(Cs) - 2); t = f - i0
        return Cs[i0].lerp(Cs[i0 + 1], t)
    kx, kz = P.get('flat_x', 1.0), P.get('flat_z', 1.0)
    f0, f1 = P.get('flat_s0', 0.03), P.get('flat_s1', 0.12)
    # cuff taper: the ribbed cuff gathers the sleeve end (cross-section scaled down over the last few cm)
    s_end = max((p0[k] - A).dot(d0) for k in idx); taper = P.get('cuff_taper', 1.0); tl = P.get('cuff_len', 0.10)
    for k in idx:
        p = p0[k]; s = (p - A).dot(d0); r = p - A - d0 * s
        r.y *= P.get('depth', 1.0)
        th = Theta * smoothstep(s0, s0 + Lb, s)
        R = Matrix.Rotation(th, 3, axis); rr = R @ r
        # flatten the cross-section like a hanging sleeve: thin seen from the front (kx), wide front-to-back (kz)
        f = smoothstep(f0, f1, s)
        if f > 0 and (kx != 1.0 or kz != 1.0):
            t = R @ d0; Yf = Vector((0, 1, 0)); Yf = (Yf - t * Yf.dot(t)).normalized(); Xf = t.cross(Yf)
            rr = Xf * (rr.dot(Xf) * (1 + (kx - 1) * f)) + Yf * (rr.dot(Yf) * (1 + (kz - 1) * f)) + t * rr.dot(t)
        if taper != 1.0:
            rr = rr * (1 + (taper - 1) * smoothstep(s_end - tl, s_end - 0.02, s))
        q = centre(s) + rr
        w = 0.0 if k in seamset else smoothstep(0.0, P['seam_blend'], kds.find(p)[2])
        res = p.lerp(q, w)
        n, i, _ = verts[k]; out[n][i] = list(res)
    info['side%+d' % side] = {'theta_deg': round(math.degrees(Theta), 1), 'axis_len_m': round((C - A).length, 3)}
pos.update(out)
# cuff band Mesh_0052 follows the sleeve (IDW over sleeve displacement rest->new)
o = bpy.data.objects['Mesh_0052']
src = [verts[k][2] for k in range(len(verts))]; dst = []
for n in names: dst += [Vector(p) for p in out[n]]
kdr = KDTree(len(src))
for k, p in enumerate(src): kdr.insert(p, k)
kdr.balance()
cuff = []
for v in o.data.vertices:
    p = o.matrix_world @ v.co; acc = Vector(); ws = 0
    for co, k, d in kdr.find_n(p, 8):
        w = 1.0 / (d ** 3 + 1e-9); acc += (dst[k] - src[k]) * w; ws += w
    cuff.append(list(p + acc / ws))
pos['Mesh_0052'] = cuff
json.dump(pos, open(OUT, 'w'))
print('BEND', json.dumps(info))
