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

// 保存先は2通り（コードに接続情報は書かない）
// - Supabase：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY があるとき（claude.ai 公開用では使わない）。ログインして、そのクラブのデータだけを読み書きする
// - それ以外：kits.json（最初から展示している分。読み取り専用）＋追加分（claude.ai の保存機能、なければこのブラウザの IndexedDB）
const SUPABASE = import.meta.env.MODE !== 'artifact' && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY } : null;
const kitStore = new KitStore(SUPABASE
  ? { name: 'supabase', label: 'Supabase', writable: false, empty: true, load: async () => [] }   // 展示は全部 Supabase の分（後から加える）
  : new JsonFileSource('kits.json'));
const archive = createKitArchive(document.getElementById('stage'), { store: kitStore, resolveModelUrls });
initPanel(kitStore);
initAddDialog(kitStore);
initEditDialog(kitStore);

async function loadKits() {
  try { await kitStore.load(); }
  catch (err) { setStatus('kits.json を読み込めませんでした。ローカルではサーバー経由で開いてください。'); console.error(err); }
  setView('angle');
  updatePanel();
  if (SUPABASE) return loadFromSupabase();
  // 追加したユニフォーム（展示中の7着はそのまま、後から加える）
  const src = await openUserSource();
  archive.setUserSource(src);
  if (src) {
    try { const added = await kitStore.attachUserSource(src); if (added.length && !archive.selectedId) setView('angle'); }
    catch (err) { setStatus('追加したユニフォームを読み込めませんでした: ' + describeStorageError(err)); console.error(err); }
  }
  updateAddButton(); updateInfo();
}
async function loadFromSupabase() {
  updateAddButton('ログインすると追加できます');
  const { createSupabase, ensureSignedIn, openClubSource } = await import('./supabase-mode.js');
  const client = createSupabase(SUPABASE.url, SUPABASE.key);
  const user = await ensureSignedIn(client);
  const { src, reason } = await openClubSource(client, user);
  if (src) {
    archive.setUserSource(src);
    try { await kitStore.attachUserSource(src); setView('angle'); if (!kitStore.size) setStatus('このクラブのユニフォームはまだありません。右上の＋から追加できます'); }
    catch (err) { setStatus('ユニフォームを読み込めませんでした: ' + describeStorageError(err)); console.error(err); }
  }
  updateAddButton(reason); updateInfo();
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
