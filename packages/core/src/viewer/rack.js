// 展示ラック（ハンガーバー1本）・床・霞と、掛ける位置（rack-layout.js の計算結果を使う）
import * as THREE from 'three';
import { RAIL, computeRackLayout, railTopY } from '../data/rack-layout.js';
import { ctx, items, state, emit, listen, track } from './context.js';
import { TARGET, view } from './view.js';
import { snapHome } from './display-items.js';

// ---- 展示ラック（固定。回転・移動しない） ----
// 奥行き方向（z）に伸びる金属のハンガーバー1本だけ（脚・支柱・補強材はない）。
// 古いシーズンを奥（-z）、新しいシーズンを手前（+z）に掛ける。長さと掛ける位置はユニフォームの数から計算する。
// 終端が目立たないよう、展示範囲の外へ長めに伸ばし、両端を透明にぼかす。さらに空間の霞で奥を背景に溶かし、
// 半無限に続いて見えるようにする（実際の長さは「展示範囲＋手前 1.5m＋奥 25m」）
let rackGroup, floor;
const rackMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.55, roughness: 0.42, vertexColors: true, transparent: true });
function syncFloor() {
  floor.material.color.set(ctx.scene.background).multiplyScalar(0.94);
  ctx.scene.fog.color.set(ctx.scene.background);
}
// レール・床・霞を作る（initViewer から1回だけ）
export function initRack() {
  rackGroup = new THREE.Group(); rackGroup.name = 'rack'; ctx.scene.add(rackGroup);
  floor = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.scale.setScalar(80); ctx.scene.add(floor);
  // 空間の霞（背景と同じ色）。奥ほど背景に溶ける。距離はカメラに合わせて毎フレーム調整する（updateFog）
  ctx.scene.fog = new THREE.Fog(0xffffff, 10, 30);
  syncFloor();
  listen(matchMedia('(prefers-color-scheme: dark)'), 'change', syncFloor);
  const mo = new MutationObserver(syncFloor); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] }); track(() => mo.disconnect());
  state.rackLayout = computeRackLayout([]);
}
export function updateFog() {
  const d = ctx.camera.position.distanceTo(ctx.controls.target);
  ctx.scene.fog.near = d + 2.5; ctx.scene.fog.far = d + 16;
  // 霞で完全に背景に溶けたユニフォームは描かない（100着以上でも描く量を抑える）
  const lim2 = (ctx.scene.fog.far + 0.5) ** 2;
  for (const it of items) it.group.visible = it.state !== 'home' || it.group.position.distanceToSquared(ctx.camera.position) < lim2;
}
// バー：z 方向の円柱。頂点の色の不透明度で両端をぼかす（端から fade の範囲で 0→1）
function buildBarGeometry(zFront, zBack) {
  const len = zFront - zBack, segs = Math.max(8, Math.ceil(len / 0.25));
  const g = new THREE.CylinderGeometry(RAIL.radius, RAIL.radius, len, 20, segs, true);
  g.rotateX(Math.PI / 2); g.translate(0, RAIL.y, (zFront + zBack) / 2);   // 円柱の軸を z に向ける
  const pos = g.attributes.position, col = new Float32Array(pos.count * 4);
  const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    col.set([1, 1, 1, smooth((zFront - z) / RAIL.fadeFront) * smooth((z - zBack) / RAIL.fadeBack)], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}
// レールを作り直す（長さ・範囲は rack-layout.js の計算結果をそのまま使う）
function buildRail(layout) {
  rackGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); rackGroup.clear();
  const bar = new THREE.Mesh(buildBarGeometry(layout.rail.zFront, layout.rail.zBack), rackMat);
  bar.name = 'hanger_bar'; rackGroup.add(bar);
  // 視点：手前から最大 RAIL.viewWindow 着の範囲を見る（100着以上でも手前の展示が小さくならない）
  TARGET.set(0, RAIL.y - 0.55, layout.view.targetZ);
  const tanH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
  view.dist = Math.max(3, (layout.view.windowHalf + 0.6) / (tanH * Math.min(ctx.camera.aspect || 1, 1.4)));
}
// 並べ替え済みのデータから、レールと全アイテムの掛ける位置を計算し直す（登録順は使わない）
export function relayout(sortedKits) {
  state.rackLayout = computeRackLayout(sortedKits);
  buildRail(state.rackLayout);
  for (const it of items) {
    const slot = state.rackLayout.slots.get(it.data.id);
    if (!slot) continue;
    it.frontIndex = slot.frontIndex; it.slotZ = slot.z;
    placeOnRack(it);
  }
  emit('info');
}
// レールに掛ける位置：フックの内側の一番上がレールの上面に乗る。並び替えで動くときは滑らかに移動する
export function placeOnRack(item) {
  if (!item.pivot || item.slotZ === undefined) return;   // モデルの読み込み待ち（読み込み後に attachModel から呼ばれる）
  item.home.pos.set(-item.pivot.x, railTopY() - item.pivot.y, item.slotZ - item.pivot.z);
  item.worldBox = null;
  if (item.state === 'home' || item.state === 'moving') {
    if (!item.placed) { snapHome(item); item.placed = true; } else item.state = 'moving';
  }
}
