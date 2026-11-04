"""Hang the whole garment (torso + back hem + short sleeves + collar_2) on a hanger and let gravity act.
No pins: the shirt is held only by collision/friction with the hanger."""
import bpy, bmesh, sys, json, math, time
from mathutils import Vector
a = sys.argv[sys.argv.index('--')+1:]
sys.path.insert(0, a[0]); from common import world_mesh, mesh_object, simulate
P = json.loads(a[1]); OUT = a[2]
names = P.get('names', ['shirt_out', 'Mesh_0046.001', 'sleeves_short', 'collar_2'])
bm, src, mapping = world_mesh(names)
M = len(bm.verts)
rest = [v.co.copy() for v in bm.verts]
faces = [[v.index for v in f.verts] for f in bm.faces]
if P.get('subdiv', 0):
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=P['subdiv'], use_grid_fill=True)
    bm.verts.ensure_lookup_table()
    assert all((bm.verts[i].co - rest[i]).length < 1e-9 for i in range(M)), 'original verts reordered'
lift = Vector((0, 0, P.get('lift', 0.02)))
for v in bm.verts: v.co += lift
ob = mesh_object('garment_sim', bm)
if P.get('start_pos'):
    # start from a hand-arranged pose; the rest lengths stay the original (worn) fabric lengths
    sp = json.load(open(P['start_pos']))
    ob.shape_key_add(name='Basis'); sk = ob.shape_key_add(name='start')
    for (n, i), mi in zip(src, mapping):
        if n in sp: sk.data[mi].co = Vector(sp[n][i]) + lift
    sk.value = 1.0
    if P.get('subdiv', 0): raise SystemExit('start_pos with subdiv not supported')
# hanger collider: same curve as the viewer hanger (tube r=8mm)
def hz(x):
    ax = abs(x)
    return -0.005 - 0.0105 * (ax / 0.1) ** 2 if ax <= 0.1 else -0.015 - 0.025 * ((ax - 0.1) / 0.09) ** 1.3
hb = bmesh.new()
r = P.get('hanger_r', 0.008); seg = 12; N = 40
rings = []
for k in range(N + 1):
    x = -0.19 + 0.38 * k / N; z = hz(x)
    x2 = x + 0.001; t = Vector((0.001, 0, hz(x2) - z)).normalized(); nrm = Vector((-t.z, 0, t.x))
    ring = []
    for s in range(seg):
        ang = 2 * math.pi * s / seg
        off = nrm * math.cos(ang) * r + Vector((0, 1, 0)) * math.sin(ang) * r * P.get('hanger_depth_scale', 1.0)
        ring.append(hb.verts.new(Vector((x, 0, z)) + off))
    rings.append(ring)
for k in range(N):
    for s in range(seg):
        hb.faces.new([rings[k][s], rings[k][(s+1) % seg], rings[k+1][(s+1) % seg], rings[k+1][s]])
hb.faces.new(rings[0][::-1]); hb.faces.new(rings[-1])
hanger = mesh_object('hanger_col', hb)
hanger.modifiers.new('col', 'COLLISION')
hanger.collision.thickness_outer = P.get('h_thick', 0.004); hanger.collision.cloth_friction = P.get('friction', 10)
pin_name = None
if P.get('pin_strip'):
    # hanger contact: top strip of the shoulders (torso + sleeve tops), i.e. where the hanger bar touches
    xb = {}
    for i in range(M):
        p_ = rest[i]
        if abs(p_.x) < P['strip_x']: k_ = round(p_.x, 2); xb[k_] = max(xb.get(k_, -9), p_.z)
    vg = ob.vertex_groups.new(name='pin'); pinned = []
    for i in range(M):
        p_ = rest[i]; top = xb.get(round(p_.x, 2))
        if top is not None and abs(p_.x) < P['strip_x'] and p_.z > top - P['strip']: pinned.append(i)
    vg.add(pinned, 1.0, 'REPLACE'); pin_name = 'pin'
    print('PINNED', len(pinned))
if P.get('pin_names'):
    vg = ob.vertex_groups.get('pin') or ob.vertex_groups.new(name='pin')
    fixed = sorted({mi for (n, i), mi in zip(src, mapping) if n in P['pin_names']})
    vg.add(fixed, 1.0, 'REPLACE'); pin_name = 'pin'
    print('PINNED objects', P['pin_names'], len(fixed))
if not P.get('hanger', True):
    hanger.modifiers.remove(hanger.modifiers['col'])
m = ob.modifiers.new('cloth', 'CLOTH'); s = m.settings
if pin_name: s.vertex_group_mass = pin_name
if P.get('start_pos'): s.rest_shape_key = ob.data.shape_keys.key_blocks['Basis']
s.compression_stiffness = P.get('compress', s.compression_stiffness)
s.quality = P['quality']; s.mass = P['mass']; s.air_damping = P.get('air', 1.0)
s.tension_stiffness = P.get('tension', 15); s.compression_stiffness = P.get('tension', 15)
s.shear_stiffness = P.get('shear', 5); s.bending_stiffness = P['bend']
s.tension_damping = P.get('damp', 5); s.compression_damping = P.get('damp', 5); s.shear_damping = P.get('damp', 5)
c = m.collision_settings
c.use_collision = True; c.distance_min = P.get('dist', 0.004); c.collision_quality = P.get('cq', 4)
c.use_self_collision = P.get('self', True); c.self_distance_min = P.get('self_dist', 0.003); c.self_friction = 5
m.point_cache.frame_start = 1; m.point_cache.frame_end = P['frames']
t0 = time.time()
final = simulate(ob, P['frames'])
fin = [final[i] for i in range(M)]
json.dump({'rest': [list(v) for v in rest], 'final': [list(v) for v in fin], 'src': src, 'mapping': mapping, 'faces': faces,
           'lift': P.get('lift', 0.02)}, open(OUT, 'w'))
low = min(p.z for p in fin); top = max(p.z for p in fin)
print('FULL done verts', M, 'sim verts', len(ob.data.vertices), 'time %.1fs' % (time.time() - t0), 'z range %.3f..%.3f' % (low, top))
