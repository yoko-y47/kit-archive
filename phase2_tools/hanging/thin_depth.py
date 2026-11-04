# 吊り下げ形の前後の厚みだけを縮める（Blender 不要。頂点位置 JSON → JSON）
# usage: python3 thin_depth.py IN.json OUT.json FACTOR
# - 各高さ（Blender の z）での胴体の前後中央 c(z) を中心に、全メッシュの y（前後）を FACTOR 倍に縮める
# - 変換は位置だけで決まる同じ関数なので、別メッシュの縫い目の頂点は一致したまま。
#   同じ高さでは前後の並び順も変わらないため、胴体と袖・襟の内外関係（めり込み）も増えない
import json, sys

src, out, k = sys.argv[1], sys.argv[2], float(sys.argv[3])
P = json.load(open(src))

# 胴体の前後中央を 1cm ごとに測り、±3cm で平均してなめらかにする
torso = P['shirt_out']
zs = [p[2] for p in torso]
z0, z1 = min(zs), max(zs)
n = int((z1 - z0) / 0.01) + 1
bins = [[] for _ in range(n)]
for x, y, z in torso: bins[min(n - 1, int((z - z0) / 0.01))].append(y)
mid = [((max(b) + min(b)) / 2) if b else None for b in bins]
for i in range(n):   # 空の段は近い段で埋める
    if mid[i] is None: mid[i] = next(mid[j] for d in range(1, n) for j in (i - d, i + d) if 0 <= j < n and mid[j] is not None)
smooth = [sum(mid[max(0, i - 3):i + 4]) / len(mid[max(0, i - 3):i + 4]) for i in range(n)]

def center(z):
    t = min(max((z - z0) / 0.01, 0), n - 1)
    i = min(int(t), n - 2) if n > 1 else 0
    f = t - i
    return smooth[i] * (1 - f) + smooth[min(i + 1, n - 1)] * f

res = {name: [[x, center(z) + k * (y - center(z)), z] for x, y, z in pts] for name, pts in P.items()}
json.dump(res, open(out, 'w'))

def depth(pts):
    return max(p[1] for p in pts) - min(p[1] for p in pts)
print('THIN', k, 'torso depth', round(depth(torso), 3), '->', round(depth(res['shirt_out']), 3))
