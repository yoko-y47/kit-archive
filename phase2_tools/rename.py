import bpy
from mathutils import Matrix
plan=[('Mesh_0047','collar_3','Mesh_0049'),('Mesh_0049.001','collar_12','Mesh_0051'),('Mesh_0031','collar_13','Mesh_0034')]
for old,new,child in plan:
    assert new not in bpy.data.objects, new+' already exists'
    p=bpy.data.objects[old]; c=bpy.data.objects[child]
    p.name=new; assert p.name==new
    mw=c.matrix_world.copy()
    c.parent=p; c.matrix_parent_inverse=p.matrix_world.inverted(); c.matrix_world=mw
    print('DONE',old,'->',new,'child',child)
bpy.ops.wm.save_mainfile()
print('SAVED',bpy.data.filepath)
