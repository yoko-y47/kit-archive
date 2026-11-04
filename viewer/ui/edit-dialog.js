// ---- シーズン・種別の編集（選択中のユニフォーム） ----
// 仮データ（kits.json）は書き換えず、変えた項目だけを保存先に「上書き」として保存する（kit-data.js の KitStore.update）
// 追加したユニフォームは、そのデータを書き換える。名前が自動で付けたもの（「シーズン 種別」）なら付け直す
import { CATEGORIES, findSameSlot } from '../kit-data.js';
import { describeStorageError } from '../kit-storage.js';
import { state } from '../core/context.js';
import { $, escapeHtml, setFieldError, showNotice, checkSeason, setStatus } from './util.js';

const editBtn = $('editBtn'), editDialog = $('editDialog'), editForm = $('editForm');
const eSeason = $('eSeason'), eTypes = $('eTypes'), editSubmit = $('editSubmit'), editError = $('editError');
const editing = { id: null, busy: false };
const autoName = (season, type) => season && type ? `${season} ${type}` : null;
let kitStore = null;

export function initEditDialog(store) {
  kitStore = store;
  for (const c of [...CATEGORIES, '']) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="radio" name="editType" value="${c}"><span${c ? '' : ' lang="ja"'}>${c || '未設定'}</span>`;
    eTypes.appendChild(l);
  }
  editBtn.addEventListener('click', () => {
    const it = state.selectedItem; if (!it || !kitStore.canAdd) return;
    const d = it.data;
    editing.id = d.id;
    $('editTarget').textContent = `「${d.name}」${d.placeholder ? '（仮データ）' : ''}`;
    $('editWhere').textContent = '保存先：' + state.userSource.label + (kitStore.originOf(d.id) === 'base' ? '（kits.json は書き換えず、変更だけを保存します）' : '');
    eSeason.value = d.season ?? '';
    editForm.querySelector(`input[name="editType"][value="${d.type ?? ''}"]`).checked = true;
    setFieldError('errESeason', '', eSeason); showNotice(editError, '');
    editDialog.showModal();
  });
  $('editClose').addEventListener('click', closeEdit);
  $('editCancel').addEventListener('click', closeEdit);
  editDialog.addEventListener('cancel', e => { if (editing.busy) e.preventDefault(); });
  eSeason.addEventListener('input', () => setFieldError('errESeason', '', eSeason));
  editForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (editing.busy) return;
    const cur = kitStore.get(editing.id);
    if (!cur) { showNotice(editError, 'このユニフォームは見つかりません'); return; }
    const s = eSeason.value.trim() ? checkSeason(eSeason.value) : { season: null, year: null };
    setFieldError('errESeason', s.error, eSeason);
    if (s.error) { eSeason.focus(); return; }
    const type = editForm.querySelector('input[name="editType"]:checked')?.value || null;
    const patch = { season: s.season, seasonStartYear: s.year, type };
    // 追加したユニフォームで、名前が自動で付けたものなら付け直す（「(2)」などの番号も含めて）
    const auto = autoName(cur.season, cur.type);
    if (kitStore.originOf(cur.id) === 'user' && auto && (cur.name === auto || cur.name.startsWith(auto + ' ('))) {
      const n = autoName(s.season, type);
      if (n) { const same = findSameSlot(kitStore.list().filter(k => k.id !== cur.id), s.year, type); patch.name = n + (same.length ? ` (${same.length + 1})` : ''); }
    }
    editing.busy = true; editSubmit.disabled = true; editSubmit.textContent = '保存中…'; showNotice(editError, '');
    try {
      const r = await kitStore.update(cur.id, patch);
      if (!r.ok) throw new Error(r.errors.join(' / ') + (r.cause ? '：' + describeStorageError(r.cause) : ''));
      editDialog.close();
      const slot = state.rackLayout.slots.get(cur.id);
      setStatus(`「${r.kit.name}」のシーズン・種別を保存しました（レールの手前から ${slot ? slot.frontIndex + 1 : '?'} 番目）`);
    } catch (err) {
      console.error(err);
      showNotice(editError, escapeHtml(err.message || String(err)) + '<br>もう一度お試しください');
    } finally { editing.busy = false; editSubmit.disabled = false; editSubmit.textContent = '保存'; }
  });
}
function closeEdit() { if (!editing.busy) editDialog.close(); }
