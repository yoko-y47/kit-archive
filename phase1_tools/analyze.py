import bpy, bmesh, json, os, sys, math
from mathutils import Vector
from mathutils.kdtree import KDTree
OUT=sys.argv[sys.argv.index('--')+1]
scene=bpy.context.scene; vl=bpy.context.view_layer
dg=bpy.context.evaluated_depsgraph_get()
def r(v,n=5): return [round(x,n) for x in v]
def rnaprops(idb, skip=()):
    d={}
    for p in idb.bl_rna.properties:
        k=p.identifier
        if k in ('rna_type',)+tuple(skip): continue
        try: v=getattr(idb,k)
        except Exception: continue
        if p.type in ('BOOLEAN','INT','FLOAT','STRING','ENUM'):
            if getattr(p,'is_array',False) or (p.type in('INT','FLOAT','BOOLEAN') and getattr(p,'array_length',0)>0):
                try: v=[x for x in v]
                except Exception: pass
            if isinstance(v,set): v=sorted(v)
            if isinstance(v,float): v=round(v,6)
            d[k]=v
        elif p.type=='POINTER':
            d[k]=getattr(v,'name',None) if v is not None else None
    return d
# layer collections
def walk_lc(lc, path, acc):
    c=lc.collection
    acc[c.name]={'path':path+[c.name],'exclude':lc.exclude,'lc_hide_viewport':lc.hide_viewport,
        'col_hide_viewport':c.hide_viewport,'col_hide_render':c.hide_render,'col_hide_select':c.hide_select,
        'children':[ch.name for ch in c.children],'objects':[o.name for o in c.objects]}
    for ch in lc.children: walk_lc(ch, path+[c.name], acc)
cols={}; walk_lc(vl.layer_collection, [], cols)
# collections not linked to scene
for c in bpy.data.collections:
    if c.name not in cols:
        cols[c.name]={'path':None,'linked_to_scene':False,'children':[ch.name for ch in c.children],'objects':[o.name for o in c.objects],
            'col_hide_viewport':c.hide_viewport,'col_hide_render':c.hide_render,'users':c.users}
def wbbox(o, mesh=None):
    if mesh is None:
        pts=[o.matrix_world@Vector(c) for c in o.bound_box]
    else:
        pts=[o.matrix_world@v.co for v in mesh.vertices]
    if not pts: return None
    mn=[min(p[i] for p in pts) for i in range(3)]; mx=[max(p[i] for p in pts) for i in range(3)]
    return {'min':r(mn),'max':r(mx),'size':r([mx[i]-mn[i] for i in range(3)]),'center':r([(mx[i]+mn[i])/2 for i in range(3)])}
objs={}
kd={}; worldverts={}
for o in bpy.data.objects:
    e={'name':o.name,'type':o.type,'data':o.data.name if o.data else None,
       'collections':[c.name for c in o.users_collection],
       'parent':o.parent.name if o.parent else None,'parent_type':o.parent_type if o.parent else None,
       'children':[c.name for c in o.children],
       'location':r(o.location),'rotation_mode':o.rotation_mode,'rotation_euler_deg':r([math.degrees(a) for a in o.rotation_euler],3),
       'scale':r(o.scale),'dimensions':r(o.dimensions),'matrix_world_translation':r(o.matrix_world.translation),
       'hide_viewport':o.hide_viewport,'hide_render':o.hide_render,'hide_select':o.hide_select,
       'hide_eye(hide_get)':None,'visible_get':None,'display_type':o.display_type,
       'in_view_layer': o.name in vl.objects}
    try: e['hide_eye(hide_get)']=o.hide_get(); e['visible_get']=o.visible_get()
    except Exception as ex: e['hide_note']=str(ex)
    e['modifiers']=[]
    for m in o.modifiers:
        md={'name':m.name,'type':m.type,'show_viewport':m.show_viewport,'show_render':m.show_render}
        if m.type=='CLOTH':
            md['settings']=rnaprops(m.settings, skip=('effector_weights',))
            md['collision_settings']=rnaprops(m.collision_settings)
            pc=m.point_cache
            md['point_cache']={'frame_start':pc.frame_start,'frame_end':pc.frame_end,'is_baked':pc.is_baked,'use_disk_cache':pc.use_disk_cache,
               'use_external':pc.use_external,'filepath':pc.filepath,'name':pc.name,'info':pc.info,'is_outdated':pc.is_outdated,'use_library_path':pc.use_library_path}
        else:
            md['settings']=rnaprops(m)
        e['modifiers'].append(md)
    e['constraints']=[{'name':c.name,'type':c.type} for c in o.constraints]
    if o.type=='MESH':
        me=o.data
        me.calc_loop_triangles()
        e['mesh']={'vertices':len(me.vertices),'edges':len(me.edges),'faces':len(me.polygons),'triangles':len(me.loop_triangles),
          'ngons':sum(1 for p in me.polygons if p.loop_total>4),'quads':sum(1 for p in me.polygons if p.loop_total==4),'tris':sum(1 for p in me.polygons if p.loop_total==3),
          'uv_layers':[{'name':u.name,'active':u.active,'active_render':u.active_render} for u in me.uv_layers],
          'vertex_colors':[v.name for v in me.vertex_colors],
          'attributes':[a.name+':'+a.domain+':'+a.data_type for a in me.attributes],
          'use_auto_smooth':me.use_auto_smooth,'auto_smooth_angle_deg':round(math.degrees(me.auto_smooth_angle),2),'has_custom_normals':me.has_custom_normals,
          'smooth_faces':sum(1 for p in me.polygons if p.use_smooth),
          'shape_keys':[k.name for k in me.shape_keys.key_blocks] if me.shape_keys else [],
          'mesh_users':me.users}
        e['vertex_groups']=[{'name':g.name,'index':g.index} for g in o.vertex_groups]
        # vertex group counts
        cnt={g.index:0 for g in o.vertex_groups}
        for v in me.vertices:
            for gg in v.groups:
                if gg.weight>0: cnt[gg.group]=cnt.get(gg.group,0)+1
        for g in e['vertex_groups']: g['assigned_verts']=cnt.get(g['index'],0)
        e['material_slots']=[{'slot':i,'material':s.material.name if s.material else None,'link':s.link,
            'faces':sum(1 for p in me.polygons if p.material_index==i)} for i,s in enumerate(o.material_slots)]
        # topology: boundary edges, nonmanifold, loose, normals consistency
        bm=bmesh.new(); bm.from_mesh(me)
        bm.edges.ensure_lookup_table()
        boundary=sum(1 for ed in bm.edges if ed.is_boundary)
        nonman=sum(1 for ed in bm.edges if not ed.is_manifold and not ed.is_boundary)
        wire=sum(1 for ed in bm.edges if ed.is_wire)
        loose_v=sum(1 for v in bm.verts if not v.link_edges)
        incons=sum(1 for ed in bm.edges if ed.is_manifold and not ed.is_contiguous)
        # islands
        seen=set(); islands=0
        for f in bm.faces:
            if f.index in seen: continue
            islands+=1; st=[f]
            while st:
                x=st.pop()
                if x.index in seen: continue
                seen.add(x.index)
                for ed in x.edges:
                    for lf in ed.link_faces:
                        if lf.index not in seen: st.append(lf)
        # outward-normal heuristic: share of faces whose normal points away from object centroid (world)
        mw=o.matrix_world; n3=mw.to_3x3().inverted().transposed()
        cen=sum((mw@v.co for v in me.vertices),Vector())/max(1,len(me.vertices))
        outward=0
        for p in me.polygons:
            c=mw@p.center; n=(n3@p.normal).normalized()
            if n.dot(c-cen)>0: outward+=1
        e['topology']={'boundary_edges':boundary,'nonmanifold_edges(>2 faces)':nonman,'wire_edges':wire,'loose_verts':loose_v,
           'normal_flip_seams(manifold non-contiguous edges)':incons,'face_islands':islands,
           'faces_normal_pointing_away_from_centroid_ratio':round(outward/max(1,len(me.polygons)),3)}
        bm.free()
        e['bbox_world_basemesh']=wbbox(o, me)
        # origin relative to geometry
        bb=e['bbox_world_basemesh']
        if bb: e['origin_offset_from_bbox_center']=r([o.matrix_world.translation[i]-bb['center'][i] for i in range(3)])
        # evaluated
        oe=o.evaluated_get(dg)
        try:
            em=oe.to_mesh()
            e['evaluated']={'vertices':len(em.vertices),'faces':len(em.polygons),'bbox_world':wbbox(o,em)}
            # displacement vs base
            if len(em.vertices)==len(me.vertices):
                mx=max(((a.co-b.co).length for a,b in zip(em.vertices,me.vertices)),default=0)
                e['evaluated']['max_vertex_displacement_from_base']=round(mx,6)
            oe.to_mesh_clear()
        except Exception as ex: e['evaluated']={'error':str(ex)}
        # kd
        t=KDTree(len(me.vertices)); wv=[]
        for i,v in enumerate(me.vertices):
            p=o.matrix_world@v.co; t.insert(p,i); wv.append(p)
        t.balance(); kd[o.name]=t; worldverts[o.name]=wv
    objs[o.name]=e
# proximity matrix (base mesh): min distance & fraction of verts within 5mm/1cm of other object
names=[n for n in kd]
prox={}
for a in names:
    prox[a]={}
    for b in names:
        if a==b: continue
        ds=[kd[b].find(p)[2] for p in worldverts[a]]
        if not ds: continue
        prox[a][b]={'min':round(min(ds),5),'median':round(sorted(ds)[len(ds)//2],5),'frac_within_5mm':round(sum(1 for d in ds if d<0.005)/len(ds),3),'frac_within_1cm':round(sum(1 for d in ds if d<0.01)/len(ds),3)}
# materials
mats={}
for m in bpy.data.materials:
    d={'users':m.users,'use_nodes':m.use_nodes,'blend_method':m.blend_method,'shadow_method':m.shadow_method,'use_backface_culling':m.use_backface_culling,
       'alpha_threshold':round(m.alpha_threshold,4),'show_transparent_back':m.show_transparent_back,'diffuse_color':r(m.diffuse_color,4),'nodes':[],'links':[]}
    if m.use_nodes and m.node_tree:
        for n in m.node_tree.nodes:
            nd={'name':n.name,'type':n.type,'bl_idname':n.bl_idname}
            if n.type=='TEX_IMAGE':
                nd['image']=n.image.name if n.image else None; nd['interpolation']=n.interpolation; nd['extension']=n.extension; nd['projection']=n.projection
            if n.type=='BSDF_PRINCIPLED' or n.bl_idname.startswith('ShaderNodeBsdf'):
                nd['inputs']={}
                for i in n.inputs:
                    if i.is_linked: nd['inputs'][i.name]='LINKED'
                    elif hasattr(i,'default_value'):
                        v=i.default_value
                        try: v=r(v,4)
                        except TypeError: v=round(v,4) if isinstance(v,float) else v
                        if i.name in ('Base Color','Metallic','Roughness','Alpha','Normal','Emission','Emission Strength','Specular','Transmission'): nd['inputs'][i.name]=v
            if n.type=='MIX_RGB': nd['blend_type']=n.blend_type
            if n.type=='NORMAL_MAP': nd['space']=n.space; nd['uv_map']=n.uv_map
            if n.type=='UVMAP': nd['uv_map']=n.uv_map
            d['nodes'].append(nd)
        for l in m.node_tree.links:
            d['links'].append(f"{l.from_node.name}.{l.from_socket.name} -> {l.to_node.name}.{l.to_socket.name}")
    mats[m.name]=d
imgs={}
for im in bpy.data.images:
    fp=bpy.path.abspath(im.filepath) if im.filepath else ''
    imgs[im.name]={'filepath':im.filepath,'abs':fp,'exists_on_disk':os.path.exists(fp) if fp else False,'packed':im.packed_file is not None,
      'size':list(im.size),'source':im.source,'file_format':im.file_format,'colorspace':im.colorspace_settings.name,'users':im.users,'alpha_mode':im.alpha_mode,'has_data':im.has_data}
info={'blender_version_running':bpy.app.version_string,'file_version':list(bpy.data.version),'filepath':bpy.data.filepath,
 'scene':scene.name,'frame_current':scene.frame_current,'frame_start':scene.frame_start,'frame_end':scene.frame_end,
 'unit_system':scene.unit_settings.system,'scale_length':scene.unit_settings.scale_length,'length_unit':scene.unit_settings.length_unit,
 'render_engine':scene.render.engine,'scenes':[s.name for s in bpy.data.scenes],
 'rigidbody_world':{'exists':scene.rigidbody_world is not None,'collection':scene.rigidbody_world.collection.name if scene.rigidbody_world and scene.rigidbody_world.collection else None},
 'gravity':r(scene.gravity),'counts':{'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'collections':len(bpy.data.collections),'actions':len(bpy.data.actions),'cameras':len(bpy.data.cameras),'lights':len(bpy.data.lights)},
 'actions':[a.name for a in bpy.data.actions],
 'gltf_addon_enabled':'io_scene_gltf2' in bpy.context.preferences.addons}
json.dump({'info':info,'collections':cols,'objects':objs,'proximity':prox,'materials':mats,'images':imgs},open(OUT,'w'),ensure_ascii=False,indent=1)
print("DONE")
