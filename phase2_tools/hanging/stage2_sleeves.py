import bpy, sys, json, math
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
a = sys.argv[sys.argv.index('--')+1:]
sys.path.insert(0, a[0]); from common import *
tj = json.load(open(a[1])); P = json.loads(a[2]); OUT = a[3]
sim_names = P['sim']; follow = P.get('follow', [])
# torso collider (final shape) and rest/final lookup
trest = [Vector(p) for p in tj['rest']]; tfin = [Vector(p) for p in tj['final']]
kdt = KDTree(len(trest))
for i, p in enumerate(trest): kdt.insert(p, i)
kdt.balance()
import bmesh
cb = bmesh.new(); cv = [cb.verts.new(p) for p in tfin]
for f in tj['faces']:
    try: cb.faces.new([cv[i] for i in f])
    except ValueError: pass
col = mesh_object('torso_collider', cb)
cm = col.modifiers.new('col', 'COLLISION'); col.collision.thickness_outer = P.get('thick', 0.004); col.collision.cloth_friction = 5
# sleeve sim mesh
bm, src, mapping = world_mesh(sim_names)
rest = [v.co.copy() for v in bm.verts]
# seam verts = coincide with torso rest verts
seam = {}
for i, p in enumerate(rest):
    co, ti, d = kdt.find(p)
    if d < 0.001: seam[i] = ti
kds = KDTree(len(seam)); seam_items = list(seam.items())
for k, (i, ti) in enumerate(seam_items): kds.insert(rest[i], k)
kds.balance()
# pre-shape: follow seam displacement (IDW over seam verts), then rotate down around shoulder pivot
start = []
for i, p in enumerate(rest):
    if i in seam:
        start.append(tfin[seam[i]].copy()); continue
    acc = Vector(); ws = 0
    if P.get('follow_all', False):
        for co, ti, d in kdt.find_n(p, 8):
            w = 1.0 / (d ** 3 + 1e-9); acc += (tfin[ti] - trest[ti]) * w; ws += w
    else:
        for co, k, d in kds.find_n(p, 8):
            w = 1.0 / (d * d + 1e-6); ti = seam_items[k][1]; acc += (tfin[ti] - trest[ti]) * w; ws += w
    start.append(p + acc / ws)
for side in (-1, 1):
    sv = [i for i in seam if rest[i].x * side > 0]
    if not sv: continue
    piv = max((start[i] for i in sv), key=lambda q: q.z)
    ang = math.radians(P['rot_deg']) * side
    R = Matrix.Translation(piv) @ Matrix.Rotation(ang, 4, 'Y') @ Matrix.Translation(-piv)
    for i, p in enumerate(rest):
        if p.x * side <= 0 or i in seam: continue
        d = kds.find(p)[2]
        w = smoothstep(0.0, P['blend'], d)
        start[i] = start[i].lerp(R @ start[i], w)
# flatten sleeve tube toward the torso mid-plane (front/back), blended away from the seam
ymid = sorted(q.y for q in tfin)[len(tfin) // 2]
for i, p in enumerate(rest):
    if i in seam: continue
    w = smoothstep(0.0, P['blend'], kds.find(p)[2])
    sy = 1 + (P.get('depth', 1.0) - 1) * w
    start[i].y = ymid + (start[i].y - ymid) * sy + P.get('yoff', 0.0) * w
ob = mesh_object('sleeve_sim', bm)
ob.shape_key_add(name='Basis'); sk = ob.shape_key_add(name='start')
for i, p in enumerate(start): sk.data[i].co = p
sk.value = 1.0
vg = ob.vertex_groups.new(name='pin'); vg.add(list(seam.keys()), 1.0, 'REPLACE')
m = ob.modifiers.new('cloth', 'CLOTH'); s = m.settings
s.quality = P['quality']; s.mass = P['mass']; s.air_damping = 1.0
s.tension_stiffness = 15; s.compression_stiffness = 15; s.shear_stiffness = 5; s.bending_stiffness = P['bend']
s.vertex_group_mass = 'pin'; s.rest_shape_key = ob.data.shape_keys.key_blocks[P.get('rest','Basis')]
c = m.collision_settings; c.use_collision = True; c.distance_min = P.get('dist', 0.004); c.collision_quality = 4
c.use_self_collision = P.get('self', False); c.self_distance_min = 0.003
m.point_cache.frame_start = 1; m.point_cache.frame_end = P['frames']
st_out = {}
for (n, vi), mi in zip(src, mapping): st_out.setdefault(n, {})[vi] = list(start[mi])
json.dump({n: [d[i] for i in range(len(d))] for n, d in st_out.items()}, open(OUT + '.start.json', 'w'))
final = simulate(ob, P['frames']) if P['frames'] > 0 else [q.copy() for q in start]
for i, ti in seam.items(): final[i] = tfin[ti]          # exact seam match
out = {}
for (n, vi), mi in zip(src, mapping): out.setdefault(n, {})[vi] = list(final[mi])
# follower meshes (not simulated): IDW of sleeve displacement
kdr = KDTree(len(rest))
for i, p in enumerate(rest): kdr.insert(p, i)
kdr.balance()
for n in follow:
    o = bpy.data.objects[n]; mw = o.matrix_world; d_ = {}
    for vi, v in enumerate(o.data.vertices):
        p = mw @ v.co; acc = Vector(); ws = 0
        for co, k, d in kdr.find_n(p, 8):
            w = 1.0 / (d * d + 1e-6); acc += (final[k] - rest[k]) * w; ws += w
        d_[vi] = list(p + acc / ws)
    out[n] = d_
json.dump({n: [d[i] for i in range(len(d))] for n, d in out.items()}, open(OUT, 'w'))
print('STAGE2 done', sim_names, 'verts', len(rest), 'seam', len(seam))
