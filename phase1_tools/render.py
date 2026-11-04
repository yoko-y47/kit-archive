import bpy, sys, math
from mathutils import Vector
out=sys.argv[sys.argv.index('--')+1]
sc=bpy.context.scene
sets={1:['collar_1'],2:['collar_2'],3:['Mesh_0047','Mesh_0049'],4:['collar_4','Mesh_0045'],5:['collar_5'],6:['collar_6'],7:['collar_7'],8:['collar_8'],9:['collar_9'],10:['collar_10'],11:['collar_11'],12:['Mesh_0049.001','Mesh_0051'],13:['Mesh_0031','Mesh_0034']}
allc=sorted({n for v in sets.values() for n in v})
base=['shirt_out','Mesh_0046.001','sleeves_short']
# unhide layer collections so render sees everything we enable
def walk(lc):
    lc.hide_viewport=False; lc.exclude=False
    for c in lc.children: walk(c)
walk(bpy.context.view_layer.layer_collection)
for o in sc.objects: o.hide_render=True; o.hide_set(False)
for n in base: bpy.data.objects[n].hide_render=False
sc.render.engine='BLENDER_WORKBENCH'
sh=sc.display.shading; sh.light='STUDIO'; sh.color_type='TEXTURE'; sh.show_backface_culling=False
sc.render.resolution_x=480; sc.render.resolution_y=480; sc.render.film_transparent=False
sc.render.image_settings.file_format='PNG'
cam_d=bpy.data.cameras.new('cam'); cam_d.type='ORTHO'; cam_d.ortho_scale=0.34
cam=bpy.data.objects.new('cam',cam_d); sc.collection.objects.link(cam); sc.camera=cam
def look(pos,target):
    cam.location=Vector(pos); d=Vector(target)-cam.location
    cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
views={'front':((0.0,2.0,1.62),(0.0,0.05,1.47)),'back':((0.0,-2.0,1.62),(0.0,0.05,1.47))}
for i,parts in sets.items():
    for n in allc: bpy.data.objects[n].hide_render=(n not in parts)
    for vn,(p,t) in views.items():
        look(p,t); sc.render.filepath=f"{out}/collar_{i:02d}_{vn}.png"; bpy.ops.render.render(write_still=True)
# overview shots with collar_2
for n in allc: bpy.data.objects[n].hide_render=(n!='collar_2')
cam_d.ortho_scale=1.0
for vn,(p,t) in {'front':((0,3,1.25),(0,0.05,1.2)),'side':((3,0.05,1.25),(0,0.05,1.2)),'back':((0,-3,1.25),(0,0.05,1.2))}.items():
    look(p,t); sc.render.filepath=f"{out}/shirt_overview_{vn}.png"; bpy.ops.render.render(write_still=True)
# collar 'none' -> neck hole check
for n in allc: bpy.data.objects[n].hide_render=True
cam_d.ortho_scale=0.34; look(*views['front']); sc.render.filepath=f"{out}/collar_none_front.png"; bpy.ops.render.render(write_still=True)
# long sleeves overview
for n in ['sleeves_short']: bpy.data.objects[n].hide_render=True
for n in ['Mesh_0050','Mesh_0052','Mesh_0054','collar_2']: bpy.data.objects[n].hide_render=False
cam_d.ortho_scale=1.4; look((0,3,1.25),(0,0.05,1.2)); sc.render.filepath=f"{out}/shirt_longsleeve_front.png"; bpy.ops.render.render(write_still=True)
print("RENDERED")
