// ---- ユニフォームの追加（＋ボタン → 追加画面） ----
// 入力はシーズン・種別・キット画像（PNG）だけ。GLB は標準のユニフォーム（STANDARD_MODEL）を自動で使い、名前は「シーズン 種別」で付ける
// 1. 追加画面を開くと標準の GLB を展示と同じ処理で読み込み、別の小さな 3D 表示でプレビューする。PNG を選ぶとそれを貼って見せる
//    （プレビューは展示とは別のシーン・カメラ・描画。追加画面を開いている間、展示の選択・視点・揺れはそのまま止めずに残る）
// 2. 登録すると、PNG を保存先に保存 → データを保存 → 成功したら展示に加える（並び順・レールはストアの通知で計算し直す）
import { CATEGORIES, findSameSlot, newKitId, describeStorageError, MAX_TEXTURE_BYTES, state, loadModelRecord, prepTexture, texLoader, texCache } from 'kit-archive-core';
import { startPreview, stopPreview, showPreviewModel, setPreviewMsg, setPreviewTexture, pv } from './preview.js';
import { $, escapeHtml, fmtMB, setFieldError, showNotice, wireDrop, checkSeason, setStatus } from './util.js';

const STANDARD_MODEL = { hanging: 'models/kit_hanging.glb', worn: 'models/kit_base.glb' };
const addBtn = document.getElementById('addBtn'), addDialog = document.getElementById('addDialog'), addForm = document.getElementById('addForm');
const fSeason = $('fSeason'), fTypes = $('fTypes'), texDrop = $('texDrop'), texFile = $('texFile');
const addSubmit = $('addSubmit'), addWarn = $('addWarn'), addError = $('addError');
const pending = { tex: null, token: 0, busy: false, dupKey: null };   // tex: { file, url, texture }
let kitStore = null;
// キット画像：PNG であること・大きさ・画像として開けることを確かめてから、プレビューに貼る
const TEX_DROP_TEXT = 'PNG をドロップ<br>またはクリックして選択';

export function initAddDialog(store) {
  kitStore = store;
  for (const c of CATEGORIES) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="radio" name="kitType" value="${c}"><span>${c}</span>`;
    fTypes.appendChild(l);
  }
  addBtn.addEventListener('click', () => {
    if (!kitStore.canAdd) return;
    $('addWhere').textContent = {
      'claude.ai': '保存先：claude.ai（このアーティファクト）。再読み込み後も残り、このアーティファクトを開いた人にも表示されます',
      supabase: `保存先：${state.userSource.label}。${state.userSource.clubId ? 'ML_MyTeam の統合版と同じデータです。' : ''}このアカウントだけが見られます`
    }[state.userSource.name] ?? '保存先：このブラウザ（IndexedDB）。再読み込み後も残りますが、この端末のこのブラウザだけに保存されます（サイトのデータを消すと消えます）';
    addDialog.showModal();
    startPreview();
    if (!pv.obj) loadModelRecord(STANDARD_MODEL.hanging)
      .then(model => { if (addDialog.open && !pv.obj) showPreviewModel(model); })
      .catch(e => { console.error(e); setPreviewMsg('標準のユニフォーム（GLB）を読み込めませんでした'); });
  });
  $('addClose').addEventListener('click', closeAdd);
  $('addCancel').addEventListener('click', closeAdd);
  addDialog.addEventListener('cancel', e => { if (pending.busy) e.preventDefault(); });   // 保存中は Esc で閉じない
  addDialog.addEventListener('close', stopPreview);
  // ファイルを落とす場所以外にドロップしても、ブラウザがファイルを開かないように
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => e.preventDefault());
  wireDrop(texDrop, texFile, async (file, why) => {
    const token = ++pending.token;
    setFieldError('errTex', why || '', texDrop);
    if (!file) return;
    const fail = msg => { if (token === pending.token) setFieldError('errTex', msg, texDrop); };
    if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) return fail(`「${file.name}」は PNG ではありません。PNG 画像を選んでください`);
    if (file.size === 0) return fail('ファイルが空です');
    if (file.size > MAX_TEXTURE_BYTES) return fail(`画像が大きすぎます（${fmtMB(file.size)}）。${fmtMB(MAX_TEXTURE_BYTES)} までにしてください`);
    const url = URL.createObjectURL(file);
    let texture;
    try { texture = prepTexture(await texLoader.loadAsync(url)); }
    catch (e) { URL.revokeObjectURL(url); return fail('画像を開けませんでした（壊れているか、PNG ではありません）'); }
    if (token !== pending.token) { texture.dispose(); URL.revokeObjectURL(url); return; }
    clearTex();
    pending.tex = { file, url, texture };
    const img = $('texPreview'); img.src = url; img.hidden = false;
    const { width: w, height: h } = texture.image;
    texDrop.textContent = `${file.name} — クリックで変更`;
    $('texInfo').textContent = `${w} × ${h} px／${fmtMB(file.size)}` + (w !== h ? '　※縦横の大きさが違います。テクスチャ差し替えと同じ UV 配置の画像か確かめてください' : '');
    setPreviewTexture(texture);
  });
  fSeason.addEventListener('input', () => { setFieldError('errSeason', '', fSeason); clearDupConfirm(); });
  fTypes.addEventListener('change', () => { setFieldError('errType', ''); clearDupConfirm(); });

  addForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (pending.busy) return;
    showNotice(addError, '');
    // 必須項目
    const s = checkSeason(fSeason.value);
    const type = addForm.querySelector('input[name="kitType"]:checked')?.value ?? null;
    setFieldError('errSeason', s.error, fSeason);
    setFieldError('errType', type ? '' : '種別を選んでください');
    if (!pending.tex && !$('errTex').textContent) setFieldError('errTex', 'キット画像（PNG）を選んでください', texDrop);
    if (s.error || !type || !pending.tex) {
      const first = [s.error && fSeason, !type && fTypes.querySelector('input'), !pending.tex && texDrop].find(Boolean);
      first?.focus();
      return;
    }
    if (!kitStore.canAdd) { showNotice(addError, '保存先がないため登録できません'); return; }
    // 同じシーズン・同じ種別があれば、警告を出して確認してから登録する（重複登録は許可。名前に番号を付けて区別する）
    // 「2026-27」と「2026-27 UCL」は別のシーズンとして扱う
    const same = findSameSlot(kitStore.list(), s.year, type).filter(k => k.season === s.season), key = [s.season, type].join('|');
    const name = `${s.season} ${type}` + (same.length ? ` (${same.length + 1})` : '');
    if (same.length && pending.dupKey !== key) {
      pending.dupKey = key;
      showNotice(addWarn, `${escapeHtml(s.season)} の ${type} はすでに ${same.length} 着あります：` +
        same.map(k => `「${escapeHtml(k.name)}」`).join('、') +
        `<br>このまま登録すると「${escapeHtml(name)}」として同じ場所の後ろに並びます。よければもう一度「重複を確認して登録」を押してください`);
      addSubmit.textContent = '重複を確認して登録';
      return;
    }
    await register({ season: s.season, year: s.year, type, name });
  });
}

// reason：追加できない理由をアプリが決めるとき（Supabase でクラブがないなど）
export function updateAddButton(reason) {
  addBtn.disabled = !kitStore.canAdd;
  addBtn.title = kitStore.canAdd ? 'ユニフォームを追加'
    : reason ? reason
    : state.userSource ? 'このアーティファクトを編集する権限がないため、追加できません'
    : '保存先（IndexedDB）を使えないため、追加できません（プライベートウィンドウなど）';
}
function closeAdd() { if (!pending.busy) addDialog.close(); }
// 選んだ画像を片付ける（登録したものは展示で使うので texture は残す）
function clearTex(keepTexture) {
  if (pending.tex) { URL.revokeObjectURL(pending.tex.url); if (!keepTexture) pending.tex.texture.dispose(); }
  pending.tex = null; $('texPreview').hidden = true; texDrop.innerHTML = TEX_DROP_TEXT; $('texInfo').textContent = '';
  setPreviewTexture(null);
}

// 入力を変えたら、重複の確認をやり直す
function clearDupConfirm() { pending.dupKey = null; showNotice(addWarn, ''); addSubmit.textContent = '登録'; }

async function register({ season, year, type, name }) {
  pending.busy = true; addSubmit.disabled = true; addSubmit.textContent = '保存中…';
  const { file, texture } = pending.tex;
  let texUrl = null;
  try {
    try { texUrl = await state.userSource.putFile(file, 'image'); }
    catch (err) { throw Object.assign(new Error('キット画像を保存できませんでした：' + describeStorageError(err)), { cause: err }); }
    // 保存先が id の形を決めるとき（Supabase は uuid）はそれを使う
    const id = state.userSource.newId ? state.userSource.newId() : newKitId(year, type, new Set(kitStore.list().map(k => k.id)));
    // 読み込み済みの画像をそのまま展示に使う（登録直後にもう一度読み込まない）
    texCache.set(texUrl, Promise.resolve(texture));
    const r = await kitStore.add({
      id, season, seasonStartYear: year, name, type, variant: null,
      modelUrl: STANDARD_MODEL.hanging, modelUrlWorn: STANDARD_MODEL.worn, thumbnailUrl: null,
      hanger: { visible: true }, display: { texture: texUrl }, placeholder: false
    });
    if (!r.ok) {
      texCache.delete(texUrl);
      throw new Error(r.errors.join(' / ') + (r.cause ? '：' + describeStorageError(r.cause) : ''));
    }
    // 登録できた：展示はストアの通知で並べ直し済み。選択中のユニフォーム・視点はそのまま
    clearTex(true);
    resetAddForm();
    addDialog.close();
    const slot = state.rackLayout.slots.get(id);
    setStatus(`「${name}」を登録しました（レールの手前から ${slot ? slot.frontIndex + 1 : '?'} 番目）`);
  } catch (err) {
    console.error(err);
    if (texUrl) state.userSource.deleteFile(texUrl).catch(e => console.warn('保存したファイルを消せませんでした', texUrl, e));
    showNotice(addError, escapeHtml(err.message || String(err)) + '<br>入力内容はそのまま残っています。もう一度お試しください');
  } finally {
    pending.busy = false; addSubmit.disabled = false;
    if (addSubmit.textContent === '保存中…') addSubmit.textContent = pending.dupKey ? '重複を確認して登録' : '登録';
  }
}
function resetAddForm() {
  addForm.reset(); clearTex(); clearDupConfirm();
  ['errSeason', 'errType', 'errTex'].forEach(id => setFieldError(id, ''));
  [fSeason, texDrop].forEach(el => el.setAttribute('aria-invalid', 'false'));
  showNotice(addError, '');
}
