import bpy, json, math
from mathutils import Vector
def apply_world_positions(name, pts):
    o = bpy.data.objects[name]; inv = o.matrix_world.inverted()
    me = o.data
    assert len(me.vertices) == len(pts), (name, len(me.vertices), len(pts))
    for v, p in zip(me.vertices, pts): v.co = inv @ Vector(p)
    me.update()
def torso_positions(tj, key='final'):
    out = {}
    for (n, i), m in zip(tj['src'], tj['mapping']):
        out.setdefault(n, {})[i] = tj[key][m]
    return {n: [d[i] for i in range(len(d))] for n, d in out.items()}
def add_hanger():
    from mathutils import Vector
    pts = []
    for sx in (-1, 1):
        for t in range(21):
            u = t / 20
            # quadratic through (0,-0.005),(0.10,-0.015),(0.19,-0.04) in x/z
            x = sx * 0.19 * u
            z = -0.005 - 0.0105 * (x / 0.1) ** 2 if abs(x) <= 0.1 else -0.015 - 0.025 * ((abs(x) - 0.1) / 0.09) ** 1.3
            pts.append((x, 0.0, z))
    cd = bpy.data.curves.new('hanger_c', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = 0.008
    for sx in (0, 1):
        sp = cd.splines.new('POLY'); seg = pts[sx*21:(sx+1)*21]; sp.points.add(len(seg) - 1)
        for i, p in enumerate(seg): sp.points[i].co = (*p, 1)
    ob = bpy.data.objects.new('hanger_vis', cd); bpy.context.scene.collection.objects.link(ob)
    return ob

def refresh_meshes():
    """Workaround for a Blender 3.0 Workbench shading quirk on GUI-saved meshes (preview only)."""
    import bmesh
    for me in bpy.data.meshes:
        bm = bmesh.new(); bm.from_mesh(me); bm.to_mesh(me); bm.free(); me.update()
