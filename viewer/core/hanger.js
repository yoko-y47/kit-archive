// ハンガー：参考写真から測った形で作り、GLB の肩の形に合わせて置く（シャツの GLB ごとに1回だけ）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ハンガー（原点＝肩上端ラインの中央）
// ブナ材のスーツハンガー（ズボン掛けのバー付き・つや消しアルミのフック）。
// 形は参考写真の正面シルエットを画像から測ったもの（写真 1px = PX m、木部の上端は 887px、全幅 1550px）
// HANGER_PROFILE: [中心からの距離, 木部の上端, 下端]（px、左右の平均）
const HANGER_PROFILE = [[0,886.4,1063],[5,885.5,1063],[10,885.3,1063],[15,885.9,1063.2],[20,887,1063.6],[25,887.4,1064.3],[30,887.5,1064.8],[35,887.5,1065.5],[40,887.5,1066.1],[45,887.5,1066.9],[50,887.5,1067.8],[55,887.5,1068.7],[60,887.5,1069.8],[65,887.5,1070.8],[70,887.5,1072.2],[75,887.5,1073.5],[80,887.4,1074.9],[85,887.4,1076.4],[90,887.5,1077.9],[95,887.5,1079.6],[100,887.5,1081.2],[105,887.4,1083],[110,887.9,1084.7],[115,888.2,1086.4],[120,888.1,1088.2],[125,887.1,1090.2],[130,886.6,1092.2],[135,888.2,1094.1],[140,893.5,1096.1],[145,902.6,1098.2],[150,913.9,1100.4],[155,925.3,1102.4],[160,936,1104.5],[165,946.2,1106.6],[170,955.6,1108.7],[175,964.4,1111],[180,972.7,1113.3],[185,980.6,1115.6],[190,988,1117.8],[195,994.9,1120],[200,1001.2,1122.3],[205,1007.3,1124.6],[210,1012.9,1126.8],[215,1018.3,1129.1],[220,1023.3,1131.5],[225,1028.1,1133.9],[230,1032.6,1136.4],[235,1036.9,1138.8],[240,1040.7,1141.4],[245,1044.4,1143.9],[250,1048,1146.6],[255,1051.4,1149.2],[260,1054.6,1151.7],[265,1057.5,1154.3],[270,1060.3,1156.8],[275,1063,1159.4],[280,1065.5,1162.1],[285,1068.1,1164.7],[290,1070.5,1167.5],[295,1073,1170.2],[300,1075.3,1172.9],[305,1077.7,1175.7],[310,1080.1,1178.5],[315,1082.5,1181.3],[320,1084.9,1184],[325,1087.3,1186.8],[330,1089.7,1189.5],[335,1092,1192.2],[340,1094.4,1194.9],[345,1096.7,1197.7],[350,1099.1,1200.6],[355,1101.5,1203.3],[360,1103.9,1206],[365,1106.2,1208.8],[370,1108.6,1211.5],[375,1111.1,1214.4],[380,1113.5,1217.1],[385,1115.9,1219.9],[390,1118.4,1222.5],[395,1121,1225.3],[400,1123.4,1228],[405,1125.9,1230.7],[410,1128.4,1233.5],[415,1131,1236.3],[420,1133.5,1239.1],[425,1136.1,1241.9],[430,1138.6,1244.8],[435,1141.2,1247.7],[440,1143.8,1250.5],[445,1146.4,1253.4],[450,1149,1256.2],[455,1151.5,1259.1],[460,1154,1261.9],[465,1156.6,1264.8],[470,1159.2,1267.6],[475,1161.8,1270.5],[480,1164.4,1273.4],[485,1167,1276.3],[490,1169.5,1279.2],[495,1172.2,1282.1],[500,1175,1285],[505,1177.7,1287.9],[510,1180.3,1290.8],[515,1182.8,1293.8],[520,1185.3,1296.7],[525,1187.9,1299.6],[530,1190.5,1302.4],[535,1193.3,1305.3],[540,1196,1308.2],[545,1198.5,1311.2],[550,1201,1314.2],[555,1203.6,1317.1],[560,1206.1,1319.9],[565,1208.7,1322.7],[570,1211.1,1325.5],[575,1213.6,1328.4],[580,1216.1,1331.2],[585,1218.6,1334.1],[590,1221,1337],[595,1223.5,1339.9],[600,1226,1342.8],[605,1228.4,1345.7],[610,1230.9,1348.6],[615,1233.5,1351.5],[620,1235.9,1354.3],[625,1238.4,1357.2],[630,1240.8,1360.1],[635,1243.4,1363],[640,1246,1365.9],[645,1248.6,1368.8],[650,1251.3,1371.7],[655,1254,1374.5],[660,1256.8,1377.4],[665,1259.5,1380.3],[670,1262.4,1383.2],[675,1265.2,1386.1],[680,1268.1,1388.8],[685,1271.1,1391.3],[690,1274.2,1393.5],[695,1277.3,1395.7],[700,1280.5,1398],[705,1283.8,1400.4],[710,1287.4,1402.6],[715,1291.6,1404.8],[720,1296.3,1407],[725,1301.7,1409.2],[730,1307.3,1411.2],[735,1313.3,1413.3],[740,1320,1415.1],[745,1327.6,1417],[750,1336,1418.5],[755,1345.4,1419.8],[760,1356.5,1420.5],[765,1368.5,1421],[770,1386,1421],[775,1400,1413]];
// フックの芯線（px。ブロックに差し込まれた根元から、切りっぱなしの先端まで）
const HOOK_PATH = [[960,905],[960,870],[960,850],[961,838],[963,822],[970,800],[982,780],[1002,760],[1026,740],[1047,720],[1061,700],[1070,680],[1074,660],[1073,640],[1069,620],[1060,605],[1050,587],[1040,575],[1020,561],[1000,551],[980,548],[960,548],[940,552],[920,561],[900,575],[890,586],[880,596],[870,605],[861,612]];
const PX = 0.205 / 775;                 // 全幅 41cm
const HOOK_R = 10.5 * PX;               // フックの線の太さ（直径 約5.6mm）
const BAR = { half: 700, y: 1361, h: 42, d: 0.016 };   // ズボン掛けのバー（両端は腕の先に差し込む）
const profAt = o => {                   // 中心からの距離(px) → [上端, 下端](px)
  o = Math.min(Math.abs(o), 775);
  const i = Math.min(HANGER_PROFILE.length - 2, Math.floor(o / 5)), a = HANGER_PROFILE[i], b = HANGER_PROFILE[i + 1];
  const t = (o - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};
// ブナ材の木目（長さ方向の細い筋と、ブナ特有の小さな斑点）
function makeWoodTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dbaa7d'; g.fillRect(0, 0, c.width, c.height);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 120; i++) {
    const y = rnd() * c.height, amp = rnd() * 3, ph = rnd() * 6;
    g.strokeStyle = `rgba(150,88,42,${0.04 + rnd() * 0.08})`; g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath(); for (let x = 0; x <= c.width; x += 32) g.lineTo(x, y + Math.sin(x * 0.006 + ph) * amp); g.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(176,96,48,${0.12 + rnd() * 0.3})`;
    g.fillRect(rnd() * c.width, rnd() * c.height, 1.5 + rnd() * 5, 0.8 + rnd() * 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const woodTex = makeWoodTexture();
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, vertexColors: true, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
const barMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.0 });
const hangerMetal = new THREE.MeshStandardMaterial({ color: 0xd2d3d4, metalness: 0.3, roughness: 0.42, side: THREE.DoubleSide });
export const HANGER_BAR_GEO = new RoundedBoxGeometry(2 * BAR.half * PX, BAR.h * PX, BAR.d, 3, 0.004);
export const HOOK_END_GEO = new THREE.CircleGeometry(HOOK_R, 14);

// シャツの肩の形を調べる：各 x での上端の高さと、上端付近の布の前後中央
export function fitHanger(r) {
  const P = [], v = new THREE.Vector3();
  let top = r; while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);   // 読み込んだ GLB の座標（アイテムの content 座標と同じ）で測る
  // 胴体のメッシュ（このプロジェクトの GLB の名前）。見つからない GLB は全メッシュで測る
  const bodyNames = ['shirt_out', 'Mesh_0046001'], hasBody = !!bodyNames.find(n => r.getObjectByName(n));
  r.traverse(o => {
    if (!o.isMesh || (hasBody && !bodyNames.includes(o.name))) return;
    const pa = o.geometry.attributes.position, M = o.matrixWorld;
    for (let i = 0; i < pa.count; i++) P.push(v.fromBufferAttribute(pa, i).applyMatrix4(M).clone());
  });
  // 首まわりの布（全13種の襟を含む。表示中かどうかに関係なく）
  const PN = [];
  r.traverse(o => {
    if (!o.isMesh) return;
    const pa = o.geometry.attributes.position, M = o.matrixWorld;
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); if (Math.abs(v.x) < 0.15 && v.y > -0.08) PN.push(v.clone()); }
  });
  const band = x => {
    const near = P.filter(p => Math.abs(p.x - x) < 0.012); if (!near.length) return null;
    const top = Math.max(...near.map(p => p.y)), t = near.filter(p => p.y > top - 0.03);
    const zmin = Math.min(...t.map(p => p.z)), zmax = Math.max(...t.map(p => p.z));
    return { top, mid: (zmin + zmax) / 2, depth: zmax - zmin };
  };
  const shoulder = {};
  // 首まわり（|x|<0.12）は後ろ襟の縫い目が混じるので、肩の測定は 0.12 から
  for (let x = 0.12; x <= 0.2101; x += 0.01) for (const sx of [-1, 1]) { const b = band(sx * x); if (b) shoulder[(sx * x).toFixed(2)] = b; }
  const inner = ['-0.12', '-0.13', '-0.14', '-0.15', '-0.16', '0.12', '0.13', '0.14', '0.15', '0.16'].map(k => shoulder[k]).filter(Boolean);
  const zc = inner.reduce((s, b) => s + b.mid, 0) / Math.max(1, inner.length);   // 中央は左右の肩の前後中央の平均
  // 測定値は粗いメッシュ由来で凸凹するので、左右それぞれ x の2次式を当てはめて滑らかにする。
  // 高さは「どの測定点でも布を超えない」よう、当てはめた曲線を最大の超過分だけ下げる
  const smooth = {};
  for (const sx of [-1, 1]) {
    const s = Object.entries(shoulder).filter(([k]) => +k * sx > 0).map(([k, b]) => [Math.abs(+k), b]);
    if (s.length < 3) continue;   // 肩幅が足りない GLB（その側は既定の形で掛ける）
    const fit2 = key => {
      const n = s.length; let Sx = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy = 0, Sxy = 0, Sx2y = 0;
      for (const [x, b] of s) { const y = b[key]; Sx += x; Sx2 += x * x; Sx3 += x ** 3; Sx4 += x ** 4; Sy += y; Sxy += x * y; Sx2y += x * x * y; }
      const M = [[n, Sx, Sx2], [Sx, Sx2, Sx3], [Sx2, Sx3, Sx4]], R = [Sy, Sxy, Sx2y];
      const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(M), c = [0, 1, 2].map(j => det(M.map((row, i) => row.map((v, jj) => jj === j ? R[i] : v))) / D);
      return x => c[0] + c[1] * x + c[2] * x * x;
    };
    const top = fit2('top'), mid = fit2('mid');
    const offTop = Math.max(0, ...s.map(([x, b]) => top(x) - b.top));
    smooth[sx] = { top: x => top(x) - offTop, mid, x0: Math.min(...s.map(([x]) => x)), x1: Math.max(...s.map(([x]) => x)) };
  }
  const topY = P.length ? Math.max(...P.map(p => p.y)) : 0;
  return { shoulder, zc: inner.length ? zc : (P.length ? P.reduce((a, p) => a + p.z, 0) / P.length : 0), smooth, P, PN, topY };
}
// 写真の輪郭の高さ：腕の上端が、肩の布の 1.2cm 下に収まる一番高い位置に置く（形は変えない）
function hangerTopY(fit) {
  let y0 = Infinity;
  for (const sx of [-1, 1]) {
    const f = fit.smooth[sx]; if (!f) continue;
    for (let x = f.x0; x <= Math.min(0.205, f.x1) + 1e-9; x += 0.005) y0 = Math.min(y0, f.top(x) - 0.012 - (887 - profAt(x / PX)[0]) * PX);
  }
  return isFinite(y0) ? y0 : fit.topY - 0.012;   // 肩を測れなかったときは、布の一番上の少し下
}
// 木部：正面の輪郭（上端・下端）を、角の丸い断面で x 方向に掃引する。前後の位置は肩の布の中央に合わせる
function buildWoodGeometry(fit, Y0) {
  const N = 24, EXP = 4, os = [];
  for (let o = -775; o <= 775; o += 5) os.push(o);
  const midAt = x => {
    const ax = Math.abs(x), f = fit.smooth[Math.sign(x) || 1];
    if (!f) return fit.zc;
    const m0 = f.mid(f.x0), t = Math.min(1, Math.max(0, (ax - 0.03) / (f.x0 - 0.03)));
    return ax >= f.x0 ? f.mid(Math.min(ax, f.x1)) : fit.zc + (m0 - fit.zc) * t * t * (3 - 2 * t);
  };
  // 前後幅：ブロック 4.2cm → 肩先 4.8cm。肩では、その高さの布の前後に 1.2cm ずつ余裕を残す
  const rings = os.map(o => {
    const x = o * PX, [tp, bp] = profAt(o), top = Y0 + (887 - tp) * PX, bot = Y0 + (887 - bp) * PX, mid = midAt(x);
    const ax = Math.abs(x), u = Math.min(1, Math.max(0, (ax - 0.06) / 0.09));
    let d = 0.042 + 0.006 * u * u * (3 - 2 * u), cap = Infinity;
    if (ax >= 0.1) {
      let zmin = Infinity, zmax = -Infinity;
      for (const p of fit.P) if (Math.abs(p.x - x) < 0.012 && p.y > bot - 0.01 && p.y < top + 0.005) { if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z; }
      if (zmax > zmin) cap = Math.max(0.014, 2 * Math.min(zmax - mid, mid - zmin) - 0.024);
    }
    return { o, x, top, bot, mid, d, cap };
  });
  rings.forEach((r, i) => {   // 布の測定値のばらつきで凸凹しないよう、近くの値を平均してから制限する
    const near = rings.slice(Math.max(0, i - 4), i + 5).map(q => q.cap).filter(isFinite);
    if (near.length) r.d = Math.min(r.d, near.reduce((s, c) => s + c, 0) / near.length);
    const e = Math.max(0, (Math.abs(r.o) - 735) / 40);   // 先端は上から見ても丸く閉じる
    r.d *= Math.sqrt(Math.max(0, 1 - e * e));
  });
  // 首まわり（|x|<0.13）の布（全13種の襟を含む）との隙間
  // 中央より後ろの布（後ろ襟など）・前の布（前襟など）から 4mm 以上離れるよう、後面・前面をそれぞれ下げる
  const spread = (a, f) => a.map((_, i) => f(...a.slice(Math.max(0, i - 3), i + 4)));
  const avg = a => a.map((_, i) => { const w = a.slice(Math.max(0, i - 3), i + 4); return w.reduce((s, c) => s + c, 0) / w.length; });
  const NECK = 0.13, GAP = 0.004, back = [], front = [];
  rings.forEach((r, i) => {
    const b0 = r.mid - r.d / 2, f0 = r.mid + r.d / 2;
    back[i] = b0; front[i] = f0;
    if (Math.abs(r.x) >= NECK) return;
    for (const p of fit.PN) {
      if (Math.abs(p.x - r.x) > 0.008 || p.y < r.bot - 0.003 || p.y > r.top + 0.003) continue;
      if (p.z < r.mid) back[i] = Math.max(back[i], p.z + GAP); else front[i] = Math.min(front[i], p.z - GAP);
    }
  });
  const B = avg(spread(back, Math.max)), F = avg(spread(front, Math.min));
  rings.forEach((r, i) => {
    if (Math.abs(r.x) >= NECK + 0.01) return;
    const b = Math.max(B[i], back[i]), f = Math.max(b + 0.014, Math.min(F[i], front[i]));
    r.mid = (b + f) / 2; r.d = f - b;
  });
  const pos = [], uv = [], col = [], idx = [];
  for (const r of rings) {
    const h = r.top - r.bot, cy = (r.top + r.bot) / 2;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const y = cy + Math.sign(s) * Math.abs(s) ** (2 / EXP) * h / 2;
      pos.push(r.x, y, r.mid + Math.sign(c) * Math.abs(c) ** (2 / EXP) * r.d / 2);
      uv.push(r.x * 4, k / N);
      // 中央ブロックと腕は別の木材の継ぎ目（写真では斜めの線）。腕をわずかに濃くする
      const yp = 887 - (y - Y0) / PX, joint = 197 + (yp - 1000) * 0.3;
      const arm = Math.abs(r.o) > joint ? 0.93 : 1.0;
      col.push(arm, arm * 0.98, arm * 0.96);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + (k + 1) % N, c = (i + 1) * N + k, d = (i + 1) * N + (k + 1) % N;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// ハンガーの形をモデルごとに1回だけ作る（各アイテムは clone して形状を共有する）
// 返す pivot はフックの一番高い所の内側（ラックのバーが当たる位置）。ハンガーはここを支点に揺れる
export function buildHanger(fit) {
  const Y0 = hangerTopY(fit), toY = py => Y0 + (887 - py) * PX;
  const hanger = new THREE.Group(); hanger.userData.isHanger = true;
  const wood = new THREE.Mesh(buildWoodGeometry(fit, Y0), woodMat);
  const zTip = [-1, 1].map(sx => fit.smooth[sx] ? fit.smooth[sx].mid(Math.min(0.18, fit.smooth[sx].x1)) : fit.zc);
  const bar = new THREE.Mesh(HANGER_BAR_GEO, barMat);
  bar.position.set(0, toY(BAR.y), (zTip[0] + zTip[1]) / 2);
  // フック：写真の芯線をなめらかにつないだ管。先端は平らな切り口
  const curve = new THREE.CatmullRomCurve3(HOOK_PATH.map(([px, py]) => new THREE.Vector3((px - 957) * PX, toY(py), fit.zc)), false, 'centripetal');
  const hook = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, HOOK_R, 14, false), hangerMetal);
  const hookEnd = new THREE.Mesh(HOOK_END_GEO, hangerMetal);
  hookEnd.position.copy(curve.getPoint(1));
  hookEnd.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(1));
  hanger.add(wood, bar, hook, hookEnd);
  const top = curve.getSpacedPoints(400).reduce((a, p) => p.y > a.y ? p : a);
  const pivot = new THREE.Vector3(top.x, top.y - HOOK_R, fit.zc);
  const pivotGroup = new THREE.Group();
  pivotGroup.position.copy(pivot); hanger.position.copy(pivot).negate(); pivotGroup.add(hanger);
  return { hanger: pivotGroup, pivot };
}
