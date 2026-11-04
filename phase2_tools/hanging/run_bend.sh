#!/bin/zsh
# usage: run_bend.sh TAG PARAMS ; builds from pos_V3_FINAL (torso/collars/short unchanged), renders long front/side/q34
S=/private/tmp/claude-501/-Users-yokooyuuhei-Desktop-Kit-Archive/227ad563-fd83-4cca-a9c0-0f6e21b07b65/scratchpad
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup $S/hang/web_src.blend --python $S/hang/bend_sleeve.py -- $S/hang/pos_V3_FINAL.json "$2" $S/hang/pos_$1_bend.json 2>&1 | grep -E 'BEND|Error|Traceback'
$B -b --factory-startup $S/hang/web_src.blend --python $S/hang/push_out.py -- $S/hang/pos_$1_bend.json $S/hang/pos_$1_FINAL.json '[[["Mesh_0054","Mesh_0050"],["Mesh_0052"]]]' 0.006 2>&1 | grep -E 'PUSHOUT|Error|Traceback'
cat > $S/hang/_apply_$1.py <<PY
import bpy, sys, json
sys.path.insert(0, '$S/hang'); from apply_lib import apply_world_positions
for n, pts in json.load(open('$S/hang/pos_$1_FINAL.json')).items(): apply_world_positions(n, pts)
bpy.ops.wm.save_as_mainfile(filepath='$S/hang/tmp_$1.blend', copy=True)
PY
$B -b --factory-startup $S/hang/web_src.blend --python $S/hang/_apply_$1.py 2>&1 | grep -E 'Error|Traceback'
cd $S/hang && $B -b --factory-startup $S/hang/tmp_$1.blend --python $S/hang/final_render.py -- $S/hang $S/hang/r/final_$1 2>&1 | grep -E 'Error'
$B -b --factory-startup --python-expr "
import bpy,numpy as np
a=np.array(bpy.data.images.load('$S/hang/r/final_$1.png').pixels[:]).reshape(1280,1680,4)
o=bpy.data.images.new('s',1680,640); o.pixels=a[0:640].ravel().tolist(); o.filepath_raw='$S/hang/r/long_$1.png'; o.file_format='PNG'; o.save()" >/dev/null 2>&1
