// Kit Archive Viewer の組み立て：データ（kit-data.js / kit-storage.js）・3D 展示（core/）・画面（ui/）をつなぐ
import { KitStore, JsonFileSource } from './kit-data.js';
import { openUserSource, describeStorageError } from './kit-storage.js';
import { items, state } from './core/context.js';
import { initViewer } from './core/viewer.js';
import { setView } from './core/view.js';
import { connectStore, setCollar, setShape } from './core/kits.js';
import { selectItem, flipItem, deselectItem } from './core/display-items.js';
import { sim, swing, spin, stepSim, buildSim } from './core/cloth.js';
import { initPanel, updatePanel, updateInfo } from './ui/panel.js';
import { initAddDialog, updateAddButton } from './ui/add-dialog.js';
import { initEditDialog } from './ui/edit-dialog.js';
import { setStatus } from './ui/util.js';

// ユニフォームのデータは kits.json（最初から展示している分。読み取り専用）と、
// ユーザーが追加した分の保存先（kit-storage.js：claude.ai の保存機能、なければこのブラウザの IndexedDB）。コードには書かない
const kitStore = new KitStore(new JsonFileSource('kits.json'));

initViewer(document.getElementById('stage'));
connectStore(kitStore);
initPanel(kitStore);
initAddDialog(kitStore);
initEditDialog(kitStore);

async function loadKits() {
  try { await kitStore.load(); }
  catch (err) { setStatus('kits.json を読み込めませんでした。ローカルではサーバー経由で開いてください。'); console.error(err); }
  setView('angle');
  updatePanel();
  // 追加したユニフォーム（展示中の7着はそのまま、後から加える）
  state.userSource = await openUserSource();
  if (state.userSource) {
    try { const added = await kitStore.attachUserSource(state.userSource); if (added.length && !state.selectedItem) setView('angle'); }
    catch (err) { setStatus('追加したユニフォームを読み込めませんでした: ' + describeStorageError(err)); console.error(err); }
  }
  updateAddButton(); updateInfo();
}
// 実行中の追加・更新・削除（今は確認用。管理画面からはストアの add / update / remove を呼ぶ）
const addKit = raw => kitStore.add(raw);
const updateKit = (id, patch) => kitStore.update(id, patch);
const removeKit = id => kitStore.remove(id);

// テスト用（開発時の確認に使う）
window.__kit = { sim, swing, spin, items, kitStore, addKit, updateKit, removeKit, setCollar, setShape, stepSim, buildSim, selectItem, flipItem, deselectItem, get userSource() { return state.userSource; }, get selectedItem() { return state.selectedItem; } };

loadKits().catch(err => console.error(err));
