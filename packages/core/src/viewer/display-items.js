// 展示アイテム（1着＝1つ）の位置・向き・大きさと、選択（拡大）・前後の切り替え・ラックへ戻る動き
import * as THREE from 'three';
import { ctx, items, state, emit } from './context.js';
import { scheduleRebuild } from './cloth.js';

// ---- 展示アイテム（1着＝1つ） ----
// group（位置・向き・大きさをアニメーションする）
//  └ offset（ユニフォームの中央を回転・拡大の中心にするためのずらし）
//     └ content（シャツ＋ハンガー。中の座標はこれまでどおり「原点＝ハンガー基準点」）
// 選択対象は group.userData.displayItem で識別する。ファイル名やメッシュ名には依存しない
// 臨界減衰ばね：目標を途中で変えても位置と速度が連続し、行き過ぎない
class Spring {
  constructor(x, w) { this.x = x; this.v = 0; this.target = x; this.w = w; }
  step(dt) {
    for (let t = 0; t < dt; t += 1 / 240) {
      const h = Math.min(1 / 240, dt - t), w = this.w;
      this.v += (w * w * (this.target - this.x) - 2 * w * this.v) * h; this.x += this.v * h;
    }
  }
  settled(eps = 1e-4) { return Math.abs(this.target - this.x) < eps && Math.abs(this.v) < eps * 10; }
  snap(x) { this.x = this.target = x; this.v = 0; }
}
const SELECT_SCALE = 1.15;   // 選択時に模型そのものを大きくする倍率（さらに手前に寄せて画面に収める）
const SELECT_FILL = 0.82;    // 選択時、ハンガーを含めた全体が画面の高さ・幅に占める割合
const MOVE_W = 7, TURN_W = 7;   // ばねの速さ（大きいほど速い。7 で約0.7秒で落ち着く）
export function createDisplayItem(id, home = {}) {
  const group = new THREE.Group(), offset = new THREE.Group(), content = new THREE.Group();
  group.name = 'display_item_' + id;
  group.add(offset); offset.add(content); ctx.scene.add(group);
  const item = {
    id, group, offset, content, state: 'home', side: 'front',
    center: new THREE.Vector3(),   // 回転・拡大の中心（content 座標でのユニフォームの中央）
    home: { pos: (home.pos || new THREE.Vector3()).clone(), yaw: home.yaw || 0, scale: home.scale || 1 },
    pos: [0, 1, 2].map(() => new Spring(0, MOVE_W)), yaw: new Spring(0, TURN_W), scale: new Spring(1, MOVE_W)
  };
  group.userData.displayItem = item;
  items.push(item);
  const hp = homePose(item);
  item.pos.forEach((sp, k) => sp.snap(hp.pos.getComponent(k))); item.yaw.snap(hp.yaw); item.scale.snap(hp.scale);
  applyItemTransform(item);
  return item;
}
export function isHangerPart(o) { for (let p = o; p; p = p.parent) if (p.userData.isHanger) return true; return false; }
// content 座標での境界箱（kitOnly: ハンガーを除くユニフォームだけ）
export function contentBox(item, kitOnly) {
  item.group.updateMatrixWorld(true);
  const inv = item.content.matrixWorld.clone().invert(), box = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
  item.content.traverseVisible(o => {
    if (!o.isMesh || (kitOnly && isHangerPart(o))) return;
    o.geometry.computeBoundingBox();
    box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
  });
  return box;
}
// 中心を変えても見た目が動かないよう、位置を補正してから差し替える
function setItemCenter(item, c) {
  const d = c.clone().sub(item.center).multiplyScalar(item.scale.x).applyAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw.x);
  item.pos.forEach((sp, k) => { sp.x += d.getComponent(k); sp.target += d.getComponent(k); });
  item.center.copy(c);
}
const unwrapNear = (a, ref) => a + 2 * Math.PI * Math.round((ref - a) / (2 * Math.PI));
export function homePose(item) {
  const h = item.home;
  return { pos: item.center.clone().multiplyScalar(h.scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw).add(h.pos), yaw: unwrapNear(h.yaw, item.yaw.x), scale: h.scale };
}
// 選択時の姿勢：視線の先（画面中央）に、ハンガーを含めた全体が画面に収まる距離で置き、正面をカメラに向ける
function selectedPose(item) {
  const box = item.fitBox, s = SELECT_SCALE * item.home.scale;
  const tanH = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
  const W = Math.max(Math.abs(box.max.x - item.center.x), Math.abs(box.min.x - item.center.x), Math.abs(box.max.z - item.center.z), Math.abs(box.min.z - item.center.z)) * 2;
  const D = Math.max(s * (box.max.y - box.min.y) / (2 * tanH * SELECT_FILL), s * W / (2 * tanH * ctx.camera.aspect * SELECT_FILL));
  const fwd = ctx.camera.getWorldDirection(new THREE.Vector3());
  // 全体の上下の中央が画面中央に来るよう、ユニフォームの中央をその分ずらす
  const pos = ctx.camera.position.clone().addScaledVector(fwd, D).addScaledVector(ctx.camera.up, -s * ((box.max.y + box.min.y) / 2 - item.center.y));
  const toCam = ctx.camera.position.clone().sub(pos);
  const face = unwrapNear(Math.atan2(toCam.x, toCam.z), item.yaw.x);
  const yaw = item.side === 'back' ? unwrapNear(face + Math.PI, item.yaw.x) : face;
  return { pos, yaw, scale: s };
}
function setItemTargets(item, pose) {
  item.pos.forEach((sp, k) => sp.target = pose.pos.getComponent(k));
  item.yaw.target = pose.yaw; item.scale.target = pose.scale;
}
export function applyItemTransform(item) {
  item.group.position.set(item.pos[0].x, item.pos[1].x, item.pos[2].x);
  item.group.rotation.set(0, item.yaw.x, 0);
  item.group.scale.setScalar(item.scale.x);
  item.offset.position.copy(item.center).negate();
}
export function selectItem(item) {
  if (state.selectedItem && state.selectedItem !== item) deselectItem();
  if (item.state === 'home') setItemCenter(item, contentBox(item, true).getCenter(new THREE.Vector3()));
  item.fitBox = contentBox(item, false);
  item.side = 'front'; item.state = 'selected'; state.selectedItem = item;
  ctx.controls.enabled = false; ctx.controls.autoRotate = false;   // 選択中はカメラを動かさない
  scheduleRebuild();   // 布の計算を選択したユニフォームに移す
  emit('hint'); emit('panel');
}
export function flipItem(item) {
  item.side = item.side === 'front' ? 'back' : 'front';   // 回転中に押されても、今の角度から新しい向きへ続けて回る
}
export function deselectItem() {
  const item = state.selectedItem; if (!item) return;
  item.state = 'returning'; item.side = 'front'; state.selectedItem = null;   // ラックに戻り終わるまで布の計算は続ける
  ctx.controls.enabled = true; ctx.controls.autoRotate = state.autoRotateWanted;
  emit('hint'); emit('panel');
}
export function updateItems(dt) {
  for (const item of items) {
    if (item.state === 'home') continue;
    setItemTargets(item, item.state === 'selected' ? selectedPose(item) : homePose(item));
    item.pos.forEach(sp => sp.step(dt)); item.yaw.step(dt); item.scale.step(dt);
    if ((item.state === 'returning' || item.state === 'moving') && item.pos.every(sp => sp.settled()) && item.yaw.settled() && item.scale.settled()) {
      const hp = homePose(item);
      item.pos.forEach((sp, k) => sp.snap(hp.pos.getComponent(k))); item.yaw.snap(item.home.yaw); item.scale.snap(hp.scale);
      item.state = 'home'; item.worldBox = null;
      if (item === state.simItem) scheduleRebuild();   // 戻り終わったら布の計算をやめて共有の形状に戻す
    }
    applyItemTransform(item);
  }
}
// 布の計算は各アイテムの content 座標で行う（アイテムを動かしても値が変わらない）
export function contentMatrix(o, item) { return new THREE.Matrix4().copy(item.content.matrixWorld).invert().multiply(o.matrixWorld); }
export function snapHome(item) {
  const hp = homePose(item);
  item.pos.forEach((sp, k) => sp.snap(hp.pos.getComponent(k))); item.yaw.snap(item.home.yaw); item.scale.snap(hp.scale);
  applyItemTransform(item);
}
