import bpy, bmesh, math, json
from mathutils import Vector
from mathutils.kdtree import KDTree

def world_mesh(names):
    """Join objects (world space) into one bmesh; returns bm and list of (name, idx) per original vertex -> merged index."""
    bm = bmesh.new(); src = []
    for n in names:
        o = bpy.data.objects[n]; mw = o.matrix_world
        base = len(bm.verts)
        vs = [bm.verts.new(mw @ v.co) for v in o.data.vertices]
        for i in range(len(vs)): src.append((n, i))
        bm.verts.ensure_lookup_table()
        for p in o.data.polygons:
            try: bm.faces.new([vs[i] for i in p.vertices])
            except ValueError: pass
    pos = [v.co.copy() for v in bm.verts]
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
    bm.verts.ensure_lookup_table()
    kd = KDTree(len(bm.verts))
    for v in bm.verts: kd.insert(v.co, v.index)
    kd.balance()
    mapping = [kd.find(p)[1] for p in pos]
    return bm, src, mapping

def mesh_object(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def simulate(ob, frames):
    sc = bpy.context.scene
    sc.frame_start = 1; sc.frame_end = frames
    for f in range(1, frames + 1): sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    oe = ob.evaluated_get(dg); me = oe.to_mesh()
    out = [ob.matrix_world @ v.co for v in me.vertices]
    oe.to_mesh_clear()
    return out
