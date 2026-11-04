import bpy, bmesh, json, sys, math, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=sys.argv[sys.argv.index('--')+1]
res={}
dirs={'+X':Vector((1,0,0)),'-X':Vector((-1,0,0)),'+Y':Vector((0,1,0)),'-Y':Vector((0,-1,0)),'+Z':Vector((0,0,1)),'-Z':Vector((0,0,-1))}
bvh={}
for o in bpy.data.objects:
    if o.type!='MESH': continue
    me=o.data
    bm=bmesh.new(); bm.from_mesh(me); bm.transform(o.matrix_world)
    t=BVHTree.FromBMesh(bm); bvh[o.name]=t
    # raycast test: rays from outside toward bbox, first hit normal orientation
    xs=[v.co for v in bm.verts]
    mn=Vector([min(p[i] for p in xs) for i in range(3)]); mx=Vector([max(p[i] for p in xs) for i in range(3)])
    random.seed(1); facing={}
    for dn,dv in dirs.items():
        front=back=0
        for k in range(400):
            p=Vector([random.uniform(mn[i],mx[i]) for i in range(3)])
            origin=p-dv*3.0
            hit=t.ray_cast(origin,dv,10.0)
            if hit[0] is None: continue
            if hit[1].dot(dv)<0: front+=1
            else: back+=1
        facing[dn]={'outward_facing_hits':front,'inward_facing_hits':back}
    tot_f=sum(v['outward_facing_hits'] for v in facing.values()); tot_b=sum(v['inward_facing_hits'] for v in facing.values())
    # UV bounds
    uvb=None; uvstats={}
    if me.uv_layers:
        uv=me.uv_layers[0].data
        us=[d.uv[0] for d in uv]; vs=[d.uv[1] for d in uv]
        uvb={'u':[round(min(us),4),round(max(us),4)],'v':[round(min(vs),4),round(max(vs),4)]}
        # zero-area UV faces
        zero=0
        for p in me.polygons:
            pts=[uv[l].uv for l in p.loop_indices]
            a=0
            for i in range(1,len(pts)-1):
                a+=abs((pts[i]-pts[0]).cross(pts[i+1]-pts[0]))/2
            if a<1e-9: zero+=1
        uvstats['zero_area_uv_faces']=zero
    # boundary loops summary (z ranges)
    loops=[]
    bedges=[e for e in bm.edges if e.is_boundary]
    seen=set()
    adj={}
    for e in bedges:
        a,b=e.verts
        adj.setdefault(a.index,[]).append(b.index); adj.setdefault(b.index,[]).append(a.index)
    co={v.index:v.co.copy() for v in bm.verts}
    for s in adj:
        if s in seen: continue
        comp=[];st=[s]
        while st:
            x=st.pop()
            if x in seen: continue
            seen.add(x); comp.append(x); st.extend(adj[x])
        ps=[co[i] for i in comp]
        c=sum(ps,Vector())/len(ps)
        loops.append({'n_verts':len(comp),'center':[round(c[i],4) for i in range(3)],
          'x':[round(min(p.x for p in ps),4),round(max(p.x for p in ps),4)],'y':[round(min(p.y for p in ps),4),round(max(p.y for p in ps),4)],'z':[round(min(p.z for p in ps),4),round(max(p.z for p in ps),4)]})
    loops.sort(key=lambda l:-l['center'][2])
    # island sizes
    bm.faces.ensure_lookup_table()
    seenf=set(); isl=[]
    for f in bm.faces:
        if f.index in seenf: continue
        st=[f]; fs=[]
        while st:
            x=st.pop()
            if x.index in seenf: continue
            seenf.add(x.index); fs.append(x)
            for e in x.edges:
                for lf in e.link_faces:
                    if lf.index not in seenf: st.append(lf)
        vs=set(v for ff in fs for v in ff.verts)
        ps=[v.co for v in vs]
        c=sum(ps,Vector())/len(ps)
        isl.append({'faces':len(fs),'verts':len(vs),'area':round(sum(ff.calc_area() for ff in fs),5),'center':[round(c[i],4) for i in range(3)],
          'size':[round(max(p[i] for p in ps)-min(p[i] for p in ps),4) for i in range(3)]})
    isl.sort(key=lambda d:-d['faces'])
    area=sum(f.calc_area() for f in bm.faces)
    res[o.name]={'raycast_facing':facing,'raycast_total':{'outward':tot_f,'inward':tot_b},'uv_bounds':uvb,**uvstats,'boundary_loops':loops[:12],'n_boundary_loops':len(loops),
                 'islands':isl if len(isl)<=8 else isl[:6]+[{'_more_small_islands':len(isl)-6,'small_island_sizes_sample':[i['size'] for i in isl[6:12]]}],'surface_area_m2':round(area,4)}
    bm.free()
# overlap: for each collar part, how much of its surface lies on/inside the shirt_out surface region
def overlap(a,b,th=0.003):
    oa=bpy.data.objects[a]; cnt=0; n=0
    for v in oa.data.vertices:
        p=oa.matrix_world@v.co
        hit=bvh[b].find_nearest(p)
        n+=1
        if hit[0] is not None and hit[3]<th: cnt+=1
    return round(cnt/max(n,1),3)
collar_parts=['collar_1','collar_2','collar_5','collar_6','collar_7','collar_8','collar_9','collar_10','collar_11','Mesh_0047','Mesh_0049','collar_4','Mesh_0045','Mesh_0049.001','Mesh_0051','Mesh_0031','Mesh_0034']
ov={}
for c in collar_parts:
    ov[c]={b:{'within3mm':overlap(c,b,0.003),'within1cm':overlap(c,b,0.01)} for b in ['shirt_out','shirt_inside','sleeves_short','Mesh_0054','head']}
# pairwise identical-geometry check among collar parts
same={}
for i,a in enumerate(collar_parts):
    for b in collar_parts[i+1:]:
        r1=overlap(a,b,0.0005); r2=overlap(b,a,0.0005)
        if r1>0.3 or r2>0.3: same[a+'|'+b]=[r1,r2]
# what part of shirt_out is covered by collar region (verts of shirt within 3mm of collar)
cov={c:overlap('shirt_out',c,0.003) for c in collar_parts}
# rigid body
rb={o.name:(o.rigid_body.type if o.rigid_body else None) for o in bpy.data.objects}
# cloth settings uniformity
cl={}
for o in bpy.data.objects:
    for m in o.modifiers:
        if m.type=='CLOTH':
            s=m.settings
            cl[o.name]={'quality':s.quality,'mass':round(s.mass,4),'air_damping':round(s.air_damping,4),'tension':round(s.tension_stiffness,3),'compression':round(s.compression_stiffness,3),'shear':round(s.shear_stiffness,3),'bending':round(s.bending_stiffness,3),
              'pin_group':s.vertex_group_mass,'shrink_min':round(s.shrink_min,4),'gravity_weight':round(s.effector_weights.gravity,3),'use_collision':m.collision_settings.use_collision,'self_collision':m.collision_settings.use_self_collision,
              'distance_min':round(m.collision_settings.distance_min,4),'collision_collection':m.collision_settings.collection.name if m.collision_settings.collection else None,'cache_frames':[m.point_cache.frame_start,m.point_cache.frame_end],'baked':m.point_cache.is_baked}
colliders=[o.name for o in bpy.data.objects if o.collision and o.collision.use]
# fake users
fu={'collections':{c.name:{'users':c.users,'use_fake_user':c.use_fake_user} for c in bpy.data.collections}}
json.dump({'geom':res,'collar_overlap':ov,'collar_duplicates':same,'shirt_out_vertices_covered_by_collar':cov,'rigid_body':rb,'cloth':cl,'collision_objects':colliders,'fake_users':fu},open(OUT,'w'),ensure_ascii=False,indent=1)
print("DONE")
