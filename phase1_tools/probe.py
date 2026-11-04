import bpy
o=bpy.data.objects['shirt_out']; me=o.data
import bmesh
bm=bmesh.new(); bm.from_mesh(me)
nb=[v for v in bm.verts if any(e.is_boundary for e in v.link_edges) and v.co.z>1.37 and abs(v.co.x)<0.12]
lo=min(nb,key=lambda v:v.co.z); print('NECK lowest boundary vert',tuple(round(c,4) for c in lo.co))
# neck loop z at y-extremes
ym=max(nb,key=lambda v:v.co.y); yn=min(nb,key=lambda v:v.co.y)
print('NECK maxY vert',tuple(round(c,4) for c in ym.co),'minY vert',tuple(round(c,4) for c in yn.co))
# shoulder line: max z of shirt_out at various |x|
for x in (0.0,0.05,0.10,0.13,0.16,0.19,0.21):
    vs=[v for v in bm.verts if abs(abs(v.co.x)-x)<0.012]
    if vs: 
        t=max(vs,key=lambda v:v.co.z); print('SHOULDER x~',x,'maxz',round(t.co.z,4),'at y',round(t.co.y,4))
# torso y extent at chest
vs=[v for v in bm.verts if 1.25<v.co.z<1.35]; print('CHEST y',round(min(v.co.y for v in vs),4),round(max(v.co.y for v in vs),4),'x',round(min(v.co.x for v in vs),4),round(max(v.co.x for v in vs),4))
vs=[v for v in bm.verts if v.co.z<0.95]; print('HEM y',round(min(v.co.y for v in vs),4),round(max(v.co.y for v in vs),4))
# head nose
h=bpy.data.objects['head'].data
nz=max(h.vertices,key=lambda v:v.co.y); print('HEAD max-y vert',tuple(round(c,4) for c in nz.co))
# exporter options
props=[p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties]
print('GLTF_OPTS',props)
import addon_utils
for m in addon_utils.modules():
    if m.__name__=='io_scene_gltf2': print('GLTF_VERSION',m.bl_info.get('version'))
