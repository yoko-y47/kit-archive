import bpy, sys
out=sys.argv[sys.argv.index('--')+1]
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=False, export_extras=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
    export_animations=False, use_selection=False, use_visible=False)
print('EXPORTED')
