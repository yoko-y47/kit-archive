import bpy, sys, json, math
sys.path.insert(0, sys.argv[sys.argv.index('--')+1]); from common import *
P = json.loads(sys.argv[sys.argv.index('--')+2])
OUT = sys.argv[sys.argv.index('--')+3]
bpy.context.scene.rigidbody_world  # none
bm, src, mapping = world_mesh(['shirt_out', 'Mesh_0046.001'])
rest = [v.co.copy() for v in bm.verts]
# slice stats: envelope over a +-4 cm window, sampled every 1 cm, then smoothed along z
zs = [p.z for p in rest]; zmin, zmax = min(zs), max(zs)
samples = []
z = zmax
while z >= zmin - 1e-6:
    win = [p for p in rest if abs(p.z - z) <= P.get('win', 0.04)]
    xs = sorted(p.x for p in win); ys = sorted(p.y for p in win)
    samples.append([z, xs[0], xs[-1], ys[0], ys[-1]])
    z -= 0.01
for _ in range(P.get('smooth_iter', 6)):
    samples = [samples[0]] + [[s1[0]] + [(s0[k] + 2 * s1[k] + s2[k]) / 4 for k in range(1, 5)]
               for s0, s1, s2 in zip(samples, samples[1:], samples[2:])] + [samples[-1]]
def stats(z):
    i = min(len(samples) - 1, max(0, int(round((zmax - z) / 0.01))))
    _, x0, x1, y0, y1 = samples[i]
    a = (x1 - x0) / 2; bb = (y1 - y0) / 2
    h = ((a - bb) / (a + bb)) ** 2
    per = math.pi * (a + bb) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))
    return (x0 + x1) / 2, (y0 + y1) / 2, a, bb, per
def ell_per(a, b):
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))
def widen_for(a, b, c):
    """x scale k so that the ellipse (a*k, b*c) keeps the perimeter of (a, b)."""
    target = ell_per(a, b); lo, hi = 1.0, 3.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if ell_per(a * mid, b * c) < target: lo = mid
        else: hi = mid
    return 1 + ((lo + hi) / 2 - 1) * P['widen']
# straight silhouette: least-squares line of perimeter-preserving half-width over the lower body
_pts = []
z_ = P.get('arm_z', -0.2) if P.get('straight') else None
if P.get('straight'):
    zz = P['arm_z']
    while zz > zmin + 0.03:
        xc_, yc_, a_, b_, per_ = stats(zz)
        tt = smoothstep(P['ramp_top'], P['ramp_bot'], -zz); cc = P['depth_top'] + (P['depth'] - P['depth_top']) * tt
        _pts.append((zz, a_ * widen_for(a_, b_, cc)))
        zz -= 0.01
    n_ = len(_pts); mz = sum(q[0] for q in _pts) / n_; mw = sum(q[1] for q in _pts) / n_
    sl = sum((q[0] - mz) * (q[1] - mw) for q in _pts) / sum((q[0] - mz) ** 2 for q in _pts)
    sl *= P.get('taper', 1.0)
    print('STRAIGHT fit: mean half-width %.3f slope %.3f per m' % (mw, sl))
def straight_hw(z):
    if not P.get('straight') or z > P['arm_z'] + 0.06: return None
    return (mw + sl * (z - mz)) * P.get('hw_scale', 1.0)
target = []
for p in rest:
    xc, yc, a, b, per = stats(p.z)
    if P.get('gradual'):
        t = smoothstep(P['ramp_top'], P['ramp_bot'], -p.z)
        c = P['depth_top'] + (P['depth'] - P['depth_top']) * t
        k = widen_for(a, b, c)
        sx, sy = k, c
        if P.get('straight'):
            # straight side lines below the armpit: half-width follows a line fitted over the lower body
            hw = straight_hw(p.z)
            if hw is not None:
                ws = smoothstep(-P['arm_z'], -P['arm_z'] + 0.06, -p.z)
                ku = k * (1 + (P.get('hw_scale', 1.0) - 1) * smoothstep(0.06, -P['arm_z'], -p.z))
                sx = (1 - ws) * ku + ws * (hw / a)
    else:
        w = smoothstep(P['w_top'], P['w_bot'], -p.z)
        k = 1 + ((per / 2) / (2 * a) - 1) * P['widen']
        wx = smoothstep(P.get('wx_top', P['w_top']), P.get('wx_bot', P['w_bot']), -p.z)
        sx = 1 + (k - 1) * wx; sy = 1 + (P['depth'] - 1) * w
    target.append(Vector((xc + (p.x - xc) * sx, yc + (p.y - yc) * sy, p.z)))
ob = mesh_object('torso_sim', bm)
# shape keys: Basis = rest (original), flat = target
ob.shape_key_add(name='Basis'); sk = ob.shape_key_add(name='flat')
for i, t in enumerate(target): sk.data[i].co = t
sk.value = 1.0
# pin group: shoulder strip (hanger contact) = 1, elsewhere soft goal
xb = {}
for p in rest:
    if abs(p.x) < 0.2: k_ = round(p.x, 2); xb[k_] = max(xb.get(k_, -9), p.z)
vg = ob.vertex_groups.new(name='pin'); hard = 0
for i, p in enumerate(rest):
    top = xb.get(round(p.x, 2))
    if top is not None and p.z > top - P['strip'] and abs(p.x) < P['strip_x']:
        vg.add([i], 1.0, 'REPLACE'); hard += 1
    else:
        vg.add([i], P['goal'], 'REPLACE')
m = ob.modifiers.new('cloth', 'CLOTH'); s = m.settings
s.quality = P['quality']; s.mass = P['mass']; s.air_damping = 1.0
s.tension_stiffness = 15; s.compression_stiffness = 15; s.shear_stiffness = 5; s.bending_stiffness = P['bend']
s.vertex_group_mass = 'pin'; s.pin_stiffness = P['pin_stiff']
s.rest_shape_key = ob.data.shape_keys.key_blocks[P.get('rest','Basis')]
c = m.collision_settings; c.use_collision = False; c.use_self_collision = True; c.self_distance_min = 0.004
m.point_cache.frame_start = 1; m.point_cache.frame_end = P['frames']
final = simulate(ob, P['frames'])
json.dump({'rest': [list(v) for v in rest], 'target': [list(v) for v in target], 'final': [list(v) for v in final],
           'src': src, 'mapping': mapping, 'faces': [[v.index for v in f.verts] for f in bm.faces], 'hard_pins': hard}, open(OUT, 'w'))
print('STAGE1 done verts', len(rest), 'hard pins', hard)
