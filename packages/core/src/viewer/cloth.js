// 布の揺れ：選択中の1着だけを計算する（Position Based Dynamics）。風は常に吹いている
// ラックに掛かったままのユニフォームは、布は計算せず、ハンガーごと風で小さく揺らす（swayRack）
import * as THREE from 'three';
import { ctx, items, state, emit } from './context.js';
import { contentMatrix } from './display-items.js';

// ---- 布の揺れ（Position Based Dynamics による簡易クロスシミュレーション） ----
// 吊り下げ形をそのまま静止形として使う。肩上端（ハンガー接触部）は固定し、
// それ以外は慣性・布の伸び縮み・曲げ・減衰で動く。静止形からのずれは弱いばねで戻す。
export const sim = { built: false, n: 0, pinned: 0, links: [] };
export const swing = { ax: 0, az: 0, vx: 0, vz: 0 };
const PEND_W2 = 9.8 / 0.35, PEND_ZETA = 0.06;   // ハンガーごと揺れる振り子（長さ約35cm）
// ドラッグで視点を水平に回すと、シャツをハンガーごとフックの軸まわりに回したものとして布に慣性をかける
// w: 回転の角速度、a: 角加速度（視点の方位角の変化から求める。シャツから見た回転は視点と逆向き）
export const spin = { w: 0, a: 0, az: null };
const SPIN_W_MAX = 6, SPIN_A_MAX = 40;
const SUBSTEPS = 2, ITERS = 6, DAMP = 0.985, GOAL = 0.02, BEND_K = 0.25;
const MAX_PULL = 0.05;   // 布を引っ張ったとき、掴んだ点が元の位置から離れられる距離（m）
let rebuildPending = false;
export function scheduleRebuild() { rebuildPending = true; }
// 描画ループから毎フレーム呼ぶ：作り直しの予約があれば作り直す
export function runPendingRebuild() { if (rebuildPending) { rebuildPending = false; buildSim(); } }

function shownIn(o, r) {
  for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === r.parent) break; }
  return true;
}
// 布を計算していたアイテムを共有の形状に戻す
export function restoreRest() {
  for (const L of sim.links) {
    L.m.geometry.dispose(); L.m.geometry = L.m.userData.sharedGeometry;
    delete L.m.userData.sharedGeometry; delete L.m.userData.restPos; L.m.frustumCulled = true;
  }
  if (state.simItem) state.simItem.hangerPivot.rotation.set(0, 0, 0);
  swing.ax = swing.az = swing.vx = swing.vz = 0;
  sim.links = []; sim.built = false; sim.n = 0; state.simItem = null; state.grab = null;
}
// 布の計算は選択中（またはラックへ戻る途中）の1着だけ
export function buildSim() {
  restoreRest();
  const it = state.selectedItem || items.find(i => i.state === 'returning');
  if (!it || !it.kitRoot) { emit('info'); return; }
  state.simItem = it; const r = it.kitRoot;
  it.content.position.set(0, 0, 0); it.content.rotation.set(0, 0, 0);   // ラックでの風の揺れをやめ、ハンガーの振り子に任せる
  it.group.updateMatrixWorld(true);
  const meshes = [];
  r.traverse(o => { if (o.isMesh && shownIn(o, r)) meshes.push(o); });
  // 縫い目で一致する頂点を1つの粒子にまとめる（0.1mm 単位）
  const keyMap = new Map(), P = [], links = [], v = new THREE.Vector3();
  for (const m of meshes) {
    // 形状は全ユニフォームで共有しているので、計算中のアイテムだけ複製を持つ（restoreRest で共有に戻す）
    m.userData.sharedGeometry = m.geometry; m.geometry = m.geometry.clone();
    const pos = m.geometry.attributes.position;
    m.userData.restPos = m.userData.sharedGeometry.attributes.position.array;
    const map = new Int32Array(pos.count), M = contentMatrix(m, it);
    for (let i = 0; i < pos.count; i++) {
      v.fromArray(m.userData.restPos, i * 3).applyMatrix4(M);
      const k = Math.round(v.x * 1e4) + ',' + Math.round(v.y * 1e4) + ',' + Math.round(v.z * 1e4);
      let id = keyMap.get(k);
      if (id === undefined) { id = P.length / 3; keyMap.set(k, id); P.push(v.x, v.y, v.z); }
      map[i] = id;
    }
    const inv = M.clone().invert();
    links.push({ m, map, inv, nmat: new THREE.Matrix3().setFromMatrix4(inv) });
    m.frustumCulled = false;
  }
  const n = P.length / 3;
  // 三角形と拘束（辺＝伸び縮み、隣り合う三角形の対角＝曲げ）
  const tris = [], edges = new Map();
  const addEdge = (a, b, o) => {
    const k = a < b ? a * n + b : b * n + a;
    let e = edges.get(k); if (!e) { e = [Math.min(a, b), Math.max(a, b)]; edges.set(k, e); }
    e.push(o);
  };
  for (const L of links) {
    const idx = L.m.geometry.index, cnt = idx ? idx.count : L.m.geometry.attributes.position.count;
    for (let t = 0; t < cnt; t += 3) {
      const a = L.map[idx ? idx.array[t] : t], b = L.map[idx ? idx.array[t + 1] : t + 1], c = L.map[idx ? idx.array[t + 2] : t + 2];
      if (a === b || b === c || a === c) continue;
      tris.push(a, b, c); addEdge(a, b, c); addEdge(b, c, a); addEdge(c, a, b);
    }
  }
  const cons = [], kk = [];
  for (const e of edges.values()) {
    cons.push(e[0], e[1]); kk.push(1);
    if (e.length >= 4 && e[2] !== e[3]) { cons.push(e[2], e[3]); kk.push(BEND_K); }
  }
  const rest = new Float32Array(P);
  const cRest = new Float32Array(kk.length);
  for (let c = 0; c < kk.length; c++) {
    const a = cons[2 * c] * 3, b = cons[2 * c + 1] * 3;
    cRest[c] = Math.hypot(rest[a] - rest[b], rest[a + 1] - rest[b + 1], rest[a + 2] - rest[b + 2]);
  }
  // 肩上端の帯（ハンガー接触部）を固定
  const top = new Map();
  for (let i = 0; i < n; i++) {
    const x = rest[3 * i]; if (Math.abs(x) >= 0.19) continue;
    const bx = Math.round(x * 100); top.set(bx, Math.max(top.get(bx) ?? -9, rest[3 * i + 1]));
  }
  const invMass = new Float32Array(n).fill(1); let pinned = 0;
  for (let i = 0; i < n; i++) {
    const x = rest[3 * i], t = top.get(Math.round(x * 100));
    if (Math.abs(x) < 0.19 && t !== undefined && rest[3 * i + 1] > t - 0.015) { invMass[i] = 0; pinned++; }
  }
  // 袖が胴体を突き抜けないための簡易な当たり判定：胴体を高さ2cmごとの楕円柱で近似する
  const isTorso = new Uint8Array(n), isSleeve = new Uint8Array(n);
  for (const L of links) {
    const flag = ['shirt_out', 'Mesh_0046001'].includes(L.m.name) ? isTorso : (L.m.userData.sleeve_type ? isSleeve : null);
    if (flag) for (const id of L.map) flag[id] = 1;
  }
  const sleeveIdx = [];
  for (let i = 0; i < n; i++) if (isSleeve[i] && !isTorso[i] && invMass[i] > 0) sleeveIdx.push(i);
  let tTop = -9; for (let i = 0; i < n; i++) if (isTorso[i]) tTop = Math.max(tTop, rest[3 * i + 1]);
  const BAND = 0.02, bands = new Map();
  for (let i = 0; i < n; i++) {
    if (!isTorso[i]) continue;
    const y = rest[3 * i + 1]; if (y > tTop - 0.08) continue;   // 肩まわり（袖の付け根）は対象外
    const k = Math.floor(y / BAND); let b = bands.get(k);
    if (!b) { b = [Infinity, -Infinity, Infinity, -Infinity]; bands.set(k, b); }
    const x = rest[3 * i], z = rest[3 * i + 2];
    b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], z);
  }
  const ell = new Map();   // k -> [cx, cz, a, b]
  for (const [k, b] of bands) ell.set(k, [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[1] - b[0]) / 2, (b[3] - b[2]) / 2]);
  for (const i of sleeveIdx) {   // 静止形で袖が楕円の内側に入る帯は、楕円を縮めて静止形を乱さないようにする
    const e = ell.get(Math.floor(rest[3 * i + 1] / BAND)); if (!e) continue;
    const dx = (rest[3 * i] - e[0]) / e[2], dz = (rest[3 * i + 2] - e[1]) / e[3], r2 = dx * dx + dz * dz;
    if (r2 < 1) { const s = Math.sqrt(r2) * 0.97; e[2] *= s; e[3] *= s; }
  }
  // 毎フレームの参照を速くするため、帯ごとの楕円を配列に詰める（a=0 は対象外の帯）
  const keys = [...ell.keys()], kMin = keys.length ? Math.min(...keys) : 0, kLen = keys.length ? Math.max(...keys) - kMin + 1 : 0;
  const ellArr = new Float32Array(kLen * 4);
  for (const [k, e] of ell) ellArr.set(e, (k - kMin) * 4);
  Object.assign(sim, {
    built: true, n, pinned, links, rest, pos: new Float32Array(P), prev: new Float32Array(P), goal: new Float32Array(P),
    invMass, cons: new Int32Array(cons), cK: new Float32Array(kk), cRest, tris: new Int32Array(tris), nrm: new Float32Array(n * 3),
    sleeveIdx: new Int32Array(sleeveIdx), ell, ellArr, kMin, kLen, BAND
  });
  emit('info');
}

const _R = new THREE.Matrix4(), _e = new THREE.Euler();
let simTime = 0;
// 風の強さ（時間でゆるやかに変わる。負は奥向き）
const windAt = t => -1.2 * (0.6 + 0.4 * Math.sin(t * 1.7) + 0.3 * Math.sin(t * 4.3 + 1.0));
export function stepSim(dt) {
  if (!(dt > 0)) return;   // 同じ時刻にフレームが重なると dt=0 になり、慣性力の計算が 0 除算になる
  // ハンガーの振り子運動（風で前後に少し押される）
  const wind = windAt(simTime), push = { vx: -0.05 * wind, vz: 0 };
  for (const [a, vv] of [['ax', 'vx'], ['az', 'vz']]) {
    swing[vv] += (-PEND_W2 * swing[a] - 2 * PEND_ZETA * Math.sqrt(PEND_W2) * swing[vv] + push[vv]) * dt;
    swing[a] += swing[vv] * dt;
  }
  if (state.simItem) state.simItem.hangerPivot.rotation.set(swing.ax, 0, swing.az);
  _R.makeRotationFromEuler(_e.set(swing.ax, 0, swing.az));
  simTime += dt;
  if (!sim.built) return;
  const { pos, prev, rest, goal, invMass, cons, cK, cRest, n } = sim;
  // 静止形をハンガーの傾きに合わせて回した位置（目標位置）を1フレームに1回だけ計算
  const m = _R.elements, P0 = state.simItem.pivot, px = P0.x, py = P0.y, pz = P0.z;
  for (let j = 0; j < 3 * n; j += 3) {
    const x = rest[j] - px, y = rest[j + 1] - py, z = rest[j + 2] - pz;
    goal[j] = m[0] * x + m[4] * y + m[8] * z + px;
    goal[j + 1] = m[1] * x + m[5] * y + m[9] * z + py;
    goal[j + 2] = m[2] * x + m[6] * y + m[10] * z + pz;
  }
  // 静止形は重力と釣り合っている前提なので、ハンガーが傾いた分の重力だけをかける（g − R·g）
  const gx = 9.8 * m[4], gy = -9.8 + 9.8 * m[5], gz = 9.8 * m[6];
  const h = dt / SUBSTEPS, h2 = h * h, nc = cRest.length;
  const gi = state.grab ? 3 * state.grab.i : -1;
  // 掴んだ点は、元の位置から MAX_PULL までしか動かさない（布が伸びすぎないように）
  let tx = 0, ty = 0, tz = 0;
  if (gi >= 0) {
    const t = state.grab.target, dx = t.x - goal[gi], dy = t.y - goal[gi + 1], dz = t.z - goal[gi + 2];
    const d = Math.hypot(dx, dy, dz), k = d > MAX_PULL ? MAX_PULL / d : 1;
    tx = goal[gi] + dx * k; ty = goal[gi + 1] + dy * k; tz = goal[gi + 2] + dz * k;
  }
  // 回転する枠で見た慣性力：遠心力 ω²r、回転の加減速による力 −α×r、コリオリの力 −2ω×v（軸は鉛直、支点を通る）
  const sw = spin.w, sa = spin.a, sw2 = sw * sw, cor = 2 * sw / h;
  for (let s = 0; s < SUBSTEPS; s++) {
    for (let j = 0, i = 0; i < n; i++, j += 3) {
      if (invMass[i] === 0) {
        if (j === gi) { pos[j] = tx; pos[j + 1] = ty; pos[j + 2] = tz; }
        else { pos[j] = goal[j]; pos[j + 1] = goal[j + 1]; pos[j + 2] = goal[j + 2]; }
        prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
        continue;
      }
      const flutter = wind * (0.7 + 0.3 * Math.sin(pos[j] * 9 + pos[j + 1] * 7 + simTime * 3));
      const vx = (pos[j] - prev[j]) * DAMP, vy = (pos[j + 1] - prev[j + 1]) * DAMP, vz = (pos[j + 2] - prev[j + 2]) * DAMP;
      prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
      const rx = pos[j] - px, rz = pos[j + 2] - pz;
      const sx = sw2 * rx - sa * rz - cor * vz, sz = sw2 * rz + sa * rx + cor * vx;
      pos[j] += vx + (gx + sx) * h2; pos[j + 1] += vy + gy * h2; pos[j + 2] += vz + (gz + flutter + sz) * h2;
    }
    for (let it = 0; it < ITERS; it++) {
      for (let c = 0; c < nc; c++) {
        const a = cons[2 * c], b = cons[2 * c + 1], wa = invMass[a], wb = invMass[b], w = wa + wb;
        if (w === 0) continue;
        const ia = 3 * a, ib = 3 * b;
        const dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-9) continue;
        const f = cK[c] * (len - cRest[c]) / (len * w), fa = f * wa, fb = f * wb;
        pos[ia] += dx * fa; pos[ia + 1] += dy * fa; pos[ia + 2] += dz * fa;
        pos[ib] -= dx * fb; pos[ib + 1] -= dy * fb; pos[ib + 2] -= dz * fb;
      }
    }
    for (let j = 0, i = 0; i < n; i++, j += 3) {   // 静止形へ戻す弱いばね
      if (invMass[i] === 0) continue;
      pos[j] += (goal[j] - pos[j]) * GOAL; pos[j + 1] += (goal[j + 1] - pos[j + 1]) * GOAL; pos[j + 2] += (goal[j + 2] - pos[j + 2]) * GOAL;
    }
    // 袖の粒子が胴体の楕円柱に入ったら表面まで押し戻す（ハンガーの傾きを戻した座標で判定）
    const { sleeveIdx, ellArr: E, kMin, kLen, BAND: BD } = sim;
    for (let q = 0; q < sleeveIdx.length; q++) {
      const i = sleeveIdx[q], j = 3 * i; if (j === gi) continue;
      const x = pos[j] - px, y = pos[j + 1] - py, z = pos[j + 2] - pz;
      const lx = m[0] * x + m[1] * y + m[2] * z + px, ly = m[4] * x + m[5] * y + m[6] * z + py, lz = m[8] * x + m[9] * y + m[10] * z + pz;
      const kb = Math.floor(ly / BD) - kMin; if (kb < 0 || kb >= kLen) continue;
      const o = 4 * kb, ea = E[o + 2], eb = E[o + 3]; if (ea === 0) continue;
      const dx = (lx - E[o]) / ea, dz = (lz - E[o + 1]) / eb, r2 = dx * dx + dz * dz;
      if (r2 >= 1 || r2 < 1e-12) continue;
      const s = 1 / Math.sqrt(r2), nx = E[o] + (lx - E[o]) * s - px, ny = ly - py, nz = E[o + 1] + (lz - E[o + 1]) * s - pz;
      pos[j] = m[0] * nx + m[4] * ny + m[8] * nz + px;
      pos[j + 1] = m[1] * nx + m[5] * ny + m[9] * nz + py;
      pos[j + 2] = m[2] * nx + m[6] * ny + m[10] * nz + pz;
    }
  }
  writeBack();
}
function writeBack() {
  const { pos, nrm, tris } = sim;
  nrm.fill(0);
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
    nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
    nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
  }
  for (const L of sim.links) {
    const pa = L.m.geometry.attributes.position.array, na = L.m.geometry.attributes.normal ? L.m.geometry.attributes.normal.array : null;
    const e = L.inv.elements, r = L.nmat.elements, map = L.map;
    for (let i = 0, k = 0; i < map.length; i++, k += 3) {
      const q = 3 * map[i], x = pos[q], y = pos[q + 1], z = pos[q + 2];
      pa[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pa[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pa[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (na) {
        const a = nrm[q], b = nrm[q + 1], c = nrm[q + 2];
        let nx = r[0] * a + r[3] * b + r[6] * c, ny = r[1] * a + r[4] * b + r[7] * c, nz = r[2] * a + r[5] * b + r[8] * c;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        na[k] = nx / l; na[k + 1] = ny / l; na[k + 2] = nz / l;
      }
    }
    L.m.geometry.attributes.position.needsUpdate = true;
    if (na) L.m.geometry.attributes.normal.needsUpdate = true;
  }
}
// 視点の方位角の変化 → シャツの回転の角速度・角加速度（「正面」などで視点が飛んだときは無視する）
export function updateSpin(dt) {
  const az = ctx.controls.getAzimuthalAngle();
  let d = spin.az === null ? 0 : az - spin.az;
  if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  spin.az = az;
  if (Math.abs(d) > 0.5 || dt <= 0) { spin.w = spin.a = 0; return; }
  // 選択・前後の切り替えでアイテム自体が回る分も、布には同じ回転として効く
  const w = Math.max(-SPIN_W_MAX, Math.min(SPIN_W_MAX, -d / dt + (state.simItem ? state.simItem.yaw.v : 0)));
  const wf = spin.w + (w - spin.w) * 0.5;   // 細かいばらつきを均す
  spin.a = Math.max(-SPIN_A_MAX, Math.min(SPIN_A_MAX, (wf - spin.w) / dt));
  spin.w = wf;
}
// ラックに掛かったままのユニフォーム：ハンガーのフックを支点に、アイテムごとに少しずつずらして風で揺らす
const SWAY = 0.012;   // 揺れの大きさ（rad、約0.7°）
const _q = new THREE.Quaternion(), _p = new THREE.Vector3();
export function swayRack() {
  const t = simTime;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.kit || it === state.simItem || !it.pivot) continue;
    const ph = i * 1.37, w = windAt(t - ph * 0.15) / -1.2;   // 0.1〜1.3 くらい。奥の列ほど少し遅れて風が届く
    const ax = SWAY * (0.5 * w + 0.35 * Math.sin(t * 1.1 + ph)), az = SWAY * 0.4 * Math.sin(t * 0.8 + ph * 1.9);
    _q.setFromEuler(_e.set(ax, 0, az));
    it.content.quaternion.copy(_q);
    it.content.position.copy(it.pivot).sub(_p.copy(it.pivot).applyQuaternion(_q));   // 支点（フック）が動かないように
  }
}
// 片付け（destroyViewer）：揺れ・風・作り直しの予約を最初の状態に戻す
export function resetSim() {
  rebuildPending = false; simTime = 0;
  Object.assign(swing, { ax: 0, az: 0, vx: 0, vz: 0 });
  Object.assign(spin, { w: 0, a: 0, az: null });
}
