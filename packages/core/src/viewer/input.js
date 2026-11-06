// クリック（選択・前後の切り替え・選択解除）とドラッグ（布を引っ張る／カメラ操作）
import * as THREE from 'three';
import { ctx, items, state } from './context.js';
import { sim } from './cloth.js';
import { isHangerPart, selectItem, flipItem, deselectItem } from './display-items.js';

// ---- クリックとドラッグの区別 ----
// ユニフォーム上で押した場合：カメラは動かさない。動かさずに離したらクリック（選択・前後の切り替え）、
//   CLICK_SLOP 以上動かしたら布を引っ張る（布の計算がないときはその時点からカメラ操作に切り替える）
// 背景で押した場合：カメラ操作（OrbitControls）に任せる。動かさずに離したらクリック（選択解除）
const CLICK_SLOP = 6;   // px
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let press = null, passToControls = false, canvas;
function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, ctx.camera);
}
// 表示中のメッシュだけを対象に、一番手前の展示アイテムを返す（布の計算で動いたメッシュは境界を更新してから）
// 100着以上でも軽いよう、先にアイテムごとの境界箱で候補を絞ってからメッシュを調べる
function itemBox(it) {
  const still = it.state === 'home' && it !== state.simItem;
  if (still && it.worldBox) return it.worldBox;
  const b = new THREE.Box3().setFromObject(it.group).expandByScalar(0.03);
  if (still) it.worldBox = b;
  return b;
}
function pickItem(e) {
  setRay(e);
  for (const L of sim.links) { L.m.geometry.computeBoundingSphere(); L.m.geometry.computeBoundingBox(); }
  const meshes = [];
  for (const it of items) {
    if (!it.kit || !raycaster.ray.intersectsBox(itemBox(it))) continue;
    it.group.traverseVisible(o => { if (o.isMesh) meshes.push(o); });
  }
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  for (let o = hit.object; o; o = o.parent) if (o.userData.displayItem) return { item: o.userData.displayItem, point: hit.point, object: hit.object };
  return null;
}
// 布を掴む（座標は content 座標で持つ）
function startGrab(hit) {
  if (!sim.built || hit.item !== state.simItem || isHangerPart(hit.object)) return false;
  const inv = state.simItem.content.matrixWorld.clone().invert();
  const p = hit.point.clone().applyMatrix4(inv);
  let best = -1, bd = Infinity;
  for (let i = 0; i < sim.n; i++) {
    if (sim.invMass[i] === 0) continue;
    const d = (sim.pos[3 * i] - p.x) ** 2 + (sim.pos[3 * i + 1] - p.y) ** 2 + (sim.pos[3 * i + 2] - p.z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return false;
  const local = new THREE.Vector3().fromArray(sim.pos, 3 * best), world = local.clone().applyMatrix4(state.simItem.content.matrixWorld);
  state.grab = { i: best, target: local, world, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(ctx.camera.getWorldDirection(new THREE.Vector3()).negate(), world) };
  sim.invMass[best] = 0;
  return true;
}
// クリック・ドラッグの受け付けを始める（initViewer から1回だけ）
export function initInput() {
canvas = ctx.canvas;
canvas.addEventListener('pointerdown', e => {
  if (passToControls) return;   // 下の handOff が作ったイベントは OrbitControls へ通す
  if (e.button !== 0) return;
  if (press) { press.moved = true; return; }   // 2本目の指（ピンチなど）はクリックにしない
  const hit = pickItem(e);
  press = { x: e.clientX, y: e.clientY, id: e.pointerId, hit, moved: false };
  if (!hit) return;
  e.preventDefault(); e.stopImmediatePropagation();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 捕捉できなくても操作は続ける */ }
}, { capture: true });
canvas.addEventListener('pointermove', e => {
  if (!press || e.pointerId !== press.id) return;
  if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= CLICK_SLOP) {
    press.moved = true;
    if (press.hit && !startGrab(press.hit) && ctx.controls.enabled) {
      // 掴めない（ハンガー部分など）ときは、押した位置からのカメラ操作として OrbitControls に渡す
      passToControls = true;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: press.x, clientY: press.y, pointerId: e.pointerId, pointerType: e.pointerType, button: 0, buttons: 1, isPrimary: true, bubbles: true }));
      passToControls = false;
    }
  }
  if (state.grab) {
    setRay(e);
    if (raycaster.ray.intersectPlane(state.grab.plane, state.grab.world)) state.grab.target.copy(state.grab.world).applyMatrix4(state.simItem.content.matrixWorld.clone().invert());
  }
});
function endPress(e, cancelled) {
  if (!press || (e && e.pointerId !== press.id)) return;
  const p = press; press = null;
  if (state.grab) { if (sim.built) sim.invMass[state.grab.i] = 1; state.grab = null; }
  if (cancelled || p.moved) return;
  if (p.hit) {   // ユニフォームをクリック
    if (state.selectedItem === p.hit.item) flipItem(p.hit.item); else selectItem(p.hit.item);
  } else if (state.selectedItem) deselectItem();   // 背景をクリック
}
canvas.addEventListener('pointerup', e => endPress(e, false));
canvas.addEventListener('pointercancel', e => endPress(e, true));
}
