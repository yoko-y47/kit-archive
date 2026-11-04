import bpy, sys, json
a = sys.argv[sys.argv.index('--')+1:]
sys.path.insert(0, a[0]); from apply_lib import apply_world_positions
pos = json.load(open(a[1])); out = a[2]
for n, pts in pos.items(): apply_world_positions(n, pts)
root = bpy.data.objects['kit_root']
root['shape'] = 'hanging'
root['hanging_note'] = 'Hanging shape v5: keeps body volume (depth x0.75, ~0.19m), torso width ~0.35-0.38m, light cloth relax with shoulder tops pinned; short sleeves ~52 deg below horizontal; long sleeves beside torso; collars follow torso. Proportions measured from a reference viewer, no geometry copied.'
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print('SAVED', out, 'from', bpy.data.filepath)
