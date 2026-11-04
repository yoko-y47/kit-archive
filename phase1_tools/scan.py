import bpy, sys
objs=bpy.data.objects
cloth=sum(1 for o in objs for m in getattr(o,'modifiers',[]) if m.type=='CLOTH')
names=[o.name for o in objs]
print("SCAN|%s|ver=%s|objs=%d|meshes=%d|cloth=%d|cols=%d"%(bpy.data.filepath,bpy.data.version,len(objs),sum(1 for o in objs if o.type=='MESH'),cloth,len(bpy.data.collections)))
print("NAMES|"+", ".join(names[:80]))
print("COLS|"+", ".join(c.name for c in bpy.data.collections))
