// Kit Archive Viewer（単体版）の組み立て：データ・3D 展示（kit-archive-core）・画面（ui/）をつなぐ
import * as core from 'kit-archive-core';
import { createKitArchive, KitStore, JsonFileSource, openUserSource, describeStorageError, setView } from 'kit-archive-core';
import { initPanel, updatePanel, updateInfo } from './ui/panel.js';
import { initAddDialog, updateAddButton } from './ui/add-dialog.js';
import { initEditDialog } from './ui/edit-dialog.js';
import { setStatus } from './ui/util.js';

// GLB の置き場所：public/models。古いデータの "../export/kit_hanging.glb" などもファイル名で同じものを指す
// claude.ai 版（npm run build:artifact）は GLB を配信できないため、base64 テキスト（*.glb.b64.txt）を読む
const BUNDLED_MODELS = ['kit_hanging.glb', 'kit_base.glb'];
function resolveModelUrls(path) {
  const name = path.split('/').pop();
  if (!BUNDLED_MODELS.includes(name)) return [path];
  return import.meta.env.MODE === 'artifact' ? [`models/${name}.b64.txt`] : [`models/${name}`];
}

// ユニフォームのデータは kits.json（最初から展示している分。読み取り専用）と、
// ユーザーが追加した分の保存先（kit-storage.js：claude.ai の保存機能、なければこのブラウザの IndexedDB）。コードには書かない
const kitStore = new KitStore(new JsonFileSource('kits.json'));
const archive = createKitArchive(document.getElementById('stage'), { store: kitStore, resolveModelUrls });
initPanel(kitStore);
initAddDialog(kitStore);
initEditDialog(kitStore);

async function loadKits() {
  try { await kitStore.load(); }
  catch (err) { setStatus('kits.json を読み込めませんでした。ローカルではサーバー経由で開いてください。'); console.error(err); }
  setView('angle');
  updatePanel();
  // 追加したユニフォーム（展示中の7着はそのまま、後から加える）
  const src = await openUserSource();
  archive.setUserSource(src);
  if (src) {
    try { const added = await kitStore.attachUserSource(src); if (added.length && !archive.selectedId) setView('angle'); }
    catch (err) { setStatus('追加したユニフォームを読み込めませんでした: ' + describeStorageError(err)); console.error(err); }
  }
  updateAddButton(); updateInfo();
}

// テスト用（開発時の確認に使う）
window.__kit = {
  core, archive, kitStore, sim: core.sim, swing: core.swing, spin: core.spin, items: core.items,
  addKit: raw => kitStore.add(raw), updateKit: (id, patch) => kitStore.update(id, patch), removeKit: id => kitStore.remove(id),
  setCollar: core.setCollar, setShape: core.setShape, stepSim: core.stepSim, buildSim: core.buildSim,
  selectItem: core.selectItem, flipItem: core.flipItem, deselectItem: core.deselectItem,
  get userSource() { return core.state.userSource; }, get selectedItem() { return core.state.selectedItem; }
};

loadKits().catch(err => console.error(err));
