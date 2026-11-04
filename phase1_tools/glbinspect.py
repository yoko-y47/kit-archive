import json, struct, sys
def load(p):
    b=open(p,'rb').read()
    magic,ver,length=struct.unpack('<III',b[:12])
    l0,t0=struct.unpack('<II',b[12:20]); j=json.loads(b[20:20+l0])
    off=20+l0; l1,t1=struct.unpack('<II',b[off:off+8]); bin_=b[off+8:off+8+l1]
    return j,bin_
for p in sys.argv[1:]:
    j,bn=load(p)
    print('=====',p.split('/')[-1],'nodes',len(j.get('nodes',[])),'meshes',len(j.get('meshes',[])),'materials',[ (m['name'],m.get('doubleSided'),m.get('alphaMode','OPAQUE'),list(m.get('pbrMetallicRoughness',{}).keys())) for m in j.get('materials',[])])
    print(' images',[(i.get('name'),i.get('mimeType')) for i in j.get('images',[])],'samplers',j.get('samplers'),'textures',j.get('textures'))
    print(' scenes',[(s.get('name'),len(s['nodes'])) for s in j['scenes']])
    print(' extensionsUsed',j.get('extensionsUsed'))
    tris=0
    names=[]
    for n in j['nodes']:
        names.append(n['name'])
        if 'mesh' in n:
            m=j['meshes'][n['mesh']]
            for pr in m['primitives']:
                acc=j['accessors'][pr['indices']]; tris+=acc['count']//3
    print(' total_tris',tris,'node_names',names)
    # texcoord ranges & node extras / transforms
    if p.endswith('A_all_noapply.glb'):
        for n in j['nodes']:
            m=j['meshes'][n['mesh']]; pr=m['primitives'][0]
            a=j['accessors'][pr['attributes']['TEXCOORD_0']] if 'TEXCOORD_0' in pr['attributes'] else None
            pos=j['accessors'][pr['attributes']['POSITION']]
            print('  ',n['name'],'T/R/S',n.get('translation'),n.get('rotation'),n.get('scale'),'attrs',sorted(pr['attributes'].keys()),'mat',j['materials'][pr['material']]['name'] if 'material' in pr else None,'uvmin',[round(x,3) for x in a['min']] if a and 'min' in a else None,'uvmax',[round(x,3) for x in a['max']] if a and 'max' in a else None,'posmin',[round(x,3) for x in pos['min']],'posmax',[round(x,3) for x in pos['max']],'vcount',pos['count'],'extras',n.get('extras'))
        # compute uv range manually for shirt_out
        for n in j['nodes']:
            if n['name']!='shirt_out': continue
            pr=j['meshes'][n['mesh']]['primitives'][0]; a=j['accessors'][pr['attributes']['TEXCOORD_0']]; bv=j['bufferViews'][a['bufferView']]
            st=bv['byteOffset']+a.get('byteOffset',0); vals=struct.unpack('<%df'%(a['count']*2),bn[st:st+a['count']*8])
            us=vals[0::2]; vs=vals[1::2]; print('  shirt_out UV computed u',round(min(us),3),round(max(us),3),'v',round(min(vs),3),round(max(vs),3))
