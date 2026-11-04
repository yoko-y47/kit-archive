import bpy, sys
out=sys.argv[sys.argv.index('--')+1]
common=dict(export_format='GLB',export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
bpy.ops.export_scene.gltf(filepath=out+'/A_all_noapply.glb',export_apply=False,**common)
bpy.ops.export_scene.gltf(filepath=out+'/B_all_apply.glb',export_apply=True,**common)
bpy.ops.export_scene.gltf(filepath=out+'/C_visible_only.glb',export_apply=False,use_visible=True,**common)
bpy.ops.export_scene.gltf(filepath=out+'/D_renderable_only.glb',export_apply=False,use_renderable=True,**common)
print("EXPORTED")
