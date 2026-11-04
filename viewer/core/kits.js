// ユニフォーム（データ1件）と展示アイテムの対応：モデルの付け替え・見た目（テクスチャ・色・襟）・形状の切り替え
// kits.json の1件 → 展示アイテム1つ。GLB はパスごとに1回だけ読み込み、各アイテムはその複製を使う
// （形状・ハンガーの形状は全アイテムで共有。色を変えるマテリアルだけアイテムごとに複製）
import * as THREE from 'three';
import { isStoredUrl } from '../kit-storage.js';
import { ctx, items, state, emit } from './context.js';
import { loadModelRecord, showShortSleeves } from './models.js';
import { createDisplayItem, deselectItem } from './display-items.js';
import { relayout, placeOnRack } from './rack.js';
import { scheduleRebuild, restoreRest } from './cloth.js';

const axesTemplate = new THREE.AxesHelper(0.15);
export function attachModel(item, model) {
  if (item.kit) { item.content.remove(item.kit, item.hangerPivot, item.axes); disposeItemMaterials(item); }
  const kit = model.scene.clone(true);
  const mats = new Map();
  kit.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Kit') return;
    if (!mats.has(o.material)) { const c = o.material.clone(); c.userData.orig = { map: o.material.map, color: o.material.color.clone() }; mats.set(o.material, c); }
    o.material = mats.get(o.material);
  });
  item.materials = [...mats.values()];
  item.kit = kit; item.kitRoot = kit.getObjectByName('kit_root') || kit; item.model = model;
  item.hangerPivot = model.hanger.clone(true); applyHangerVisibility(item);
  item.pivot = model.pivot.clone();
  item.axes = axesTemplate.clone(); item.axes.visible = state.showAxes;
  item.content.add(kit, item.hangerPivot, item.axes);
  showShortSleeves(item.kitRoot); applyCollar(item); applyKitLook(item);
  placeOnRack(item);
  item.worldBox = null;
}
function disposeItemMaterials(item) { item.materials.forEach(m => m.dispose()); item.materials = []; }
// 差し替えたテクスチャがあればそれを、なければデータの色を、どちらもなければ GLB にもともと付いている見た目を使う
export function applyKitLook(item) {
  const tex = item.texture || null, color = item.data.display.color;
  for (const m of item.materials) {
    if (tex) { m.map = tex; m.color.set(0xffffff); }
    else if (color) { m.map = null; m.color.set(color); }
    else { m.map = m.userData.orig?.map ?? null; m.color.copy(m.userData.orig?.color ?? new THREE.Color(0xffffff)); }
    m.needsUpdate = true;
  }
}
export function applyCollar(item) {
  if (!item.kitRoot) return;
  for (let i = 1; i <= 13; i++) { const n = item.kitRoot.getObjectByName('collar_' + i); if (n) n.visible = (i === item.collar); }
  item.worldBox = null;
  if (item === state.simItem) scheduleRebuild();
}
export async function setItemShape(item, s) {
  item.wantShape = s;
  const worn = s === 'worn' && item.data.modelUrlWorn, path = worn ? item.data.modelUrlWorn : item.data.modelUrl;
  item.loadingModel = true;
  try {
    const model = await loadModelRecord(path);
    if (item.wantShape !== s || !items.includes(item)) return;   // 読み込み中に切り替え・削除された
    attachModel(item, model); item.shape = worn ? 'worn' : 'hanging'; item.error = false;
  } catch (e) { item.error = true; console.error(e); }
  finally { item.loadingModel = false; }
  emit('load');
  if (item === state.selectedItem || item.state === 'returning') scheduleRebuild();
}
export function setCollar(id) {
  state.lastCollar = id;
  for (const it of state.selectedItem ? [state.selectedItem] : items) { it.collar = id; applyCollar(it); }   // 未選択なら全ユニフォームに
  emit('panel');
}
export function setShape(s) {
  state.shape = s;
  deselectItem();
  emit('shape', s);
  for (const it of items) setItemShape(it, s);
  scheduleRebuild();
}
export const texCache = new Map();
export function prepTexture(tex) {
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;   // UV の V が 1〜2 の範囲にあるため
  tex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
  return tex;
}
// 1着分の展示アイテムを作る（data は kit-data.js で正規化済みのデータ）
export function createKitItem(data) {
  const item = createDisplayItem(data.id, { scale: data.display.scale });
  Object.assign(item, { data, collar: data.display.collar ?? state.lastCollar, materials: [], shape: 'hanging', wantShape: state.shape, placed: false });
  loadKitTexture(item);
  return item;
}
export function loadKitTexture(item) {
  const url = item.data.display.texture;
  if (!url) { item.texture = null; applyKitLook(item); return; }
  if (!texCache.has(url)) texCache.set(url, resolveImageUrl(url).then(u => texLoader.loadAsync(u)).then(prepTexture));
  texCache.get(url).then(t => { if (item.data.display.texture === url) { item.texture = t; applyKitLook(item); } }).catch(e => console.error(e));
}
export function removeKitItem(item) {
  if (state.selectedItem === item) deselectItem();
  if (state.simItem === item) restoreRest();
  ctx.scene.remove(item.group);
  disposeItemMaterials(item);
  items.splice(items.indexOf(item), 1);
}
// ---- データ管理層との接続（追加・更新・削除のたびに全体を並べ直す） ----
const itemOf = id => items.find(i => i.data.id === id);
// ストアの変更通知を受けて、3D 表示を合わせる（main.js から1回だけ）
export function connectStore(store) {
  store.subscribe(({ type, kit, kits, added }) => {
    if (type === 'reset') {
      for (const it of [...items]) removeKitItem(it);
      kits.forEach(createKitItem);
    } else if (type === 'add') {
      (added ?? [kit]).forEach(createKitItem);
    } else if (type === 'remove') {
      const it = itemOf(kit.id); if (it) removeKitItem(it);
    } else if (type === 'update') {
      const it = itemOf(kit.id); if (!it) return;
      const prev = it.data; it.data = kit;
      if (kit.display.collar !== prev.display.collar && kit.display.collar !== null) { it.collar = kit.display.collar; applyCollar(it); }
      if (kit.display.texture !== prev.display.texture) loadKitTexture(it); else applyKitLook(it);
      if (kit.display.scale !== prev.display.scale) { it.home.scale = kit.display.scale; if (it.state === 'home') it.state = 'moving'; }
      if (kit.hanger.visible !== prev.hanger.visible) applyHangerVisibility(it);
      if (kit.modelUrl !== prev.modelUrl || kit.modelUrlWorn !== prev.modelUrlWorn) setItemShape(it, state.shape);
    }
    relayout(kits);
    // 新しく作ったアイテムは、手前から順にモデルを読み込む（同じ GLB は1回だけ取得される）
    for (const it of [...items].filter(i => !i.kit && !i.loadingModel).sort((a, b) => a.frontIndex - b.frontIndex)) setItemShape(it, state.shape);
    if (type !== 'reset') emit('panel');
  });
}
// ハンガーは、画面の「ハンガーを表示」とデータの hanger.visible の両方が有効なときに表示する
export function applyHangerVisibility(it) { if (it.hangerPivot) it.hangerPivot.visible = state.showHanger && it.data.hanger.visible; it.worldBox = null; }
export const resolveImageUrl = async url => isStoredUrl(url) ? state.userSource.imageUrl(url) : url;
export const texLoader = new THREE.TextureLoader();
// 差し替えたテクスチャを、選択中のユニフォーム（未選択なら全ユニフォーム）に貼る
export function setTextureForTargets(tex) {
  for (const it of state.selectedItem ? [state.selectedItem] : items) { it.texture = tex; applyKitLook(it); }
}
