// kit-archive-core：3D 展示とデータ管理（単体版・ML_MyTeam 統合版の両方から使う）
//
//   import { createKitArchive, KitStore, JsonFileSource } from 'kit-archive-core';
//   const store = new KitStore(new JsonFileSource('kits.json'));
//   const archive = createKitArchive(document.getElementById('stage'), { store, resolveModelUrls: path => [path] });
//   await store.load();
//   archive.on('panel', () => { /* 情報欄などを更新 */ });
//   archive.destroy();   // 画面から外すとき（React のアンマウントなど）
//
// 3D 展示は1ページに同時に1つだけ（もう一度作るときは destroy してから）
import { ctx, items, state, on, css } from './viewer/context.js';
import { initViewer, destroyViewer } from './viewer/viewer.js';
import { setView, setOrbit } from './viewer/view.js';
import { selectItem, flipItem, deselectItem } from './viewer/display-items.js';
import { connectStore, setCollar, setShape, applyHangerVisibility, setTextureForTargets } from './viewer/kits.js';
import { sim, shake, toggleWind, setPhysics } from './viewer/cloth.js';

export function createKitArchive(container, { store, resolveModelUrls = path => [path], background = () => css('--stage') } = {}) {
  if (ctx.renderer) throw new Error('kit-archive-core: 3D 展示はすでに作られています（先に destroy してください）');
  if (!store) throw new Error('kit-archive-core: store（KitStore）を渡してください');
  ctx.options = { resolveModelUrls, background };
  initViewer(container);
  connectStore(store);
  const itemOf = id => items.find(i => i.data.id === id);
  return {
    store, items, state, on,
    get selectedId() { return state.selectedItem?.data.id ?? null; },
    select(id) { const it = itemOf(id); if (it) selectItem(it); return !!it; },
    flip() { if (state.selectedItem) flipItem(state.selectedItem); },
    deselect: deselectItem,
    setView, setOrbit, setShape, setCollar,
    setHangerVisible(v) { state.showHanger = v; items.forEach(applyHangerVisibility); },
    setAxesVisible(v) { state.showAxes = v; items.forEach(it => { if (it.axes) it.axes.visible = v; }); },
    setAutoRotate(v) { state.autoRotateWanted = v; ctx.controls.autoRotate = v && !state.selectedItem; },
    setTexture: setTextureForTargets,
    shake, toggleWind, setPhysics,
    get cloth() { return { built: sim.built, points: sim.n, pinned: sim.pinned }; },
    setUserSource(src) { state.userSource = src; },
    destroy: destroyViewer
  };
}

// データ管理（3D に依存しない）
export * from './data/kit-data.js';
export * from './data/collars.js';
export * from './data/rack-layout.js';
export * from './data/sources/kit-storage.js';
export * from './data/sources/supabase.js';

// 画面を作るときに使う、もう少し細かい部品（単体版のビューア画面が使う）
export { ctx, items, state, on, css } from './viewer/context.js';
export { setView, setOrbit } from './viewer/view.js';
export { selectItem, flipItem, deselectItem } from './viewer/display-items.js';
export { setCollar, setShape, applyHangerVisibility, prepTexture, texLoader, texCache, resolveImageUrl, setTextureForTargets } from './viewer/kits.js';
export { modelCache, loadModelRecord, showShortSleeves } from './viewer/models.js';
export { sim, swing, spin, stepSim, buildSim, shake, toggleWind, setPhysics } from './viewer/cloth.js';
