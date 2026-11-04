import bpy, math
from mathutils import Matrix, Vector
assert 'kit_root' not in bpy.data.objects
# --- hanger anchor from shoulder top line of shirt_out (original coords) ---
so=bpy.data.objects['shirt_out']; mw=so.matrix_world
tops=[]
for x0 in (0.08,0.10,0.12,0.14,0.16):
    for sgn in (-1,1):
        vs=[mw@v.co for v in so.data.vertices if abs(v.co.x-sgn*x0)<0.01]
        tops.append(max(vs,key=lambda p:p.z))
anchor=Vector((0.0, round(sum(p.y for p in tops)/len(tops),3), round(max(p.z for p in tops),3)))
print('ANCHOR_ORIG',tuple(anchor),'shoulder tops',[tuple(round(c,3) for c in p) for p in tops])
# --- transform: move anchor to origin, then rotate 180 deg about Z so front (+Y) faces -Y ---
M=Matrix.Rotation(math.pi,4,'Z') @ Matrix.Translation(-anchor)
roots=[o for o in bpy.context.scene.objects if o.parent is None]
for o in roots: o.matrix_world = M @ o.matrix_world
# --- kit_root empty at origin (= hanger anchor) ---
root=bpy.data.objects.new('kit_root',None); root.empty_display_type='ARROWS'; root.empty_display_size=0.1
bpy.data.collections['Collection'].objects.link(root)
for o in roots:
    mwo=o.matrix_world.copy(); o.parent=root; o.matrix_parent_inverse=Matrix.Identity(4); o.matrix_world=mwo
root['hanger_anchor_note']='Origin = hanger bar center (shoulder top line). Front faces -Y in Blender (= +Z in glTF/Three.js).'
root['anchor_in_original_coords']=list(anchor)
# --- custom properties for glTF extras ---
for i in range(1,14):
    o=bpy.data.objects['collar_%d'%i]; o['kit_part']='collar'; o['collar_id']=i
    for c in o.children: c['kit_part']='collar_child'; c['collar_id']=i
for n,part,grp in [('shirt_out','torso','torso'),('Mesh_0046.001','torso_back_hem','torso'),('sleeves_short','sleeves_short','sleeves'),
                   ('Mesh_0054','sleeves_long','sleeves'),('Mesh_0050','sleeves_long_part','sleeves'),('Mesh_0052','sleeves_long_part','sleeves')]:
    o=bpy.data.objects[n]; o['kit_part']=part; o['exclusive_group']=grp
    if grp=='sleeves': o['sleeve_type']='short' if n=='sleeves_short' else 'long'
bpy.ops.wm.save_mainfile()
print('SAVED')
