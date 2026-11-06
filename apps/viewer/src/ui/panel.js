// 操作パネル：襟・視点・テクスチャ差し替えのボタンと、操作の案内・情報欄
// core からの通知（'hint' 'panel' 'info' 'load' 'orbit'）を受けて表示を合わせる
import { ctx, items, state, on, setView, setOrbit, deselectItem, setCollar, COLLAR_STYLES, COLLAR_COUNT, applyHangerVisibility, prepTexture, texLoader, resolveImageUrl, setTextureForTargets, modelCache, sim } from 'kit-archive-core';
import { escapeHtml, setStatus } from './util.js';

const showHangerEl = document.getElementById('showHanger'), showAxesEl = document.getElementById('showAxes');
const collarBox = document.getElementById('collars');
let kitStore = null;

export function initPanel(store) {
  kitStore = store;
  for (let i = 1; i <= 13; i++) {
    const b = document.createElement('button');
    b.id = 'collar' + i; b.textContent = i; b.dataset.collar = i;
    b.setAttribute('aria-label', '襟 ' + i);
    b.addEventListener('click', () => chooseCollar(i));
    collarBox.appendChild(b);
  }
  document.querySelectorAll('[data-orbit]').forEach(b => b.addEventListener('click', () => setOrbit(b.dataset.orbit)));
  showHangerEl.addEventListener('change', () => { state.showHanger = showHangerEl.checked; items.forEach(applyHangerVisibility); });
  showAxesEl.addEventListener('change', e => { state.showAxes = e.target.checked; items.forEach(it => { if (it.axes) it.axes.visible = e.target.checked; }); });
  document.getElementById('spin').addEventListener('change', e => { state.autoRotateWanted = e.target.checked; ctx.controls.autoRotate = state.autoRotateWanted && !state.selectedItem; });
  // 視点を切り替えるときは、選択を解除してから（選択中の姿勢はカメラを基準にしているため）
  for (const [id, dir] of [['viewFront', 'front'], ['viewAngle', 'angle'], ['viewSide', 'side'], ['viewBack', 'back']])
    document.getElementById(id).addEventListener('click', () => { deselectItem(); setView(dir); });
  addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;   // 追加・編集画面を開いている間は、展示の操作をしない（Esc は画面を閉じる）
    if (e.target.closest && e.target.closest('input')) return;
    const cur = state.selectedItem ? state.selectedItem.collar : state.lastCollar;
    if (e.key === 'ArrowRight') chooseCollar(cur % COLLAR_COUNT + 1);
    if (e.key === 'ArrowLeft') chooseCollar((cur + COLLAR_COUNT - 2) % COLLAR_COUNT + 1);
    if (e.key === 'Escape') deselectItem();
  });

  // テクスチャ差し替え（glTF の UV 規約に合わせて flipY=false）。選択中のユニフォーム、未選択なら全ユニフォームに
  const drop = document.getElementById('drop'), fileInput = document.getElementById('file');
  const loadFile = f => applyTexture(URL.createObjectURL(f), f.name);
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => fileInput.files[0] && loadFile(fileInput.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]); });


  on('hint', updateHint);
  on('panel', updatePanel);
  on('info', updateInfo);
  on('load', updateLoadStatus);
  on('orbit', mode => document.querySelectorAll('[data-orbit]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.orbit === mode))));
}

// 襟を選ぶ：選択中のユニフォームなら、そのデータの襟として保存する（矢印キーで続けて変えたときは最後の1回だけ）
// 未選択のときは全ユニフォームの表示だけを変える
const collarTimers = new Map();
function chooseCollar(c) {
  setCollar(c);
  const it = state.selectedItem;
  if (!it) return;
  const id = it.data.id;
  clearTimeout(collarTimers.get(id));
  collarTimers.set(id, setTimeout(async () => {
    collarTimers.delete(id);
    if (kitStore.get(id)?.display.collar === c) return;
    const r = await kitStore.update(id, { display: { collar: c } });
    if (!r.ok) setStatus('襟を保存できませんでした：' + r.errors.join(' / '));
  }, 500));
}

function applyTexture(url, name) {
  texLoader.load(url, tex => {
    prepTexture(tex);
    setTextureForTargets(tex);
    setStatus('テクスチャ: ' + name);
  }, undefined, () => { setStatus('画像を読み込めませんでした。PNG/JPEG を選んでください。'); });
}

export function updateHint() {
  setStatus(state.selectedItem
    ? 'クリックで前後を切り替え／背景クリックまたは Esc で戻る'
    : 'ユニフォームをクリックで拡大／ドラッグで回転／ホイールでズーム／右ドラッグで移動');
}
function updateLoadStatus() {
  const done = items.filter(i => i.kit || i.error).length;
  if (done < items.length) { setStatus(`読み込み中… ${done} / ${items.length}`); return; }
  const bad = items.filter(i => i.error).length;
  if (bad) setStatus(`${bad} 着の GLB を読み込めませんでした。ローカルではサーバー経由で開いてください。`);
  else updateHint();
  updateInfo();
}
// パネル：選択中のユニフォームの情報と襟。未選択のときはラック全体の情報
export function updatePanel() {
  const c = state.selectedItem ? state.selectedItem.collar : null;
  collarBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.collar === c)));
  document.getElementById('collarBadge').textContent = c ? String(c).padStart(2, '0') : '';
  document.getElementById('collarName').innerHTML = c
    ? `<b>${c}</b>${COLLAR_STYLES[c]}<br><span class="hint">${kitStore.canAdd ? 'このユニフォームの襟として保存します' : '表示だけ切り替えます（保存先がないため保存しません）'}</span>`
    : '<span class="hint">選択していないときは、全ユニフォームの表示だけ切り替えます（保存しません）</span>';
  updateInfo();
}
export function updateInfo() {
  const el = document.getElementById('info'), it = state.selectedItem;
  document.getElementById('editBtn').hidden = !it || !kitStore.canAdd;
  if (!it) {
    const ph = items.filter(i => i.data.placeholder).length;
    el.innerHTML = `ハンガーバー <b>${items.length}</b> 着／バーの長さ <b>${state.rackLayout.rail.length.toFixed(1)}</b> m（端はぼかし）<br>` +
      `読み込み済み <b>${items.filter(i => i.kit).length}</b> 着／GLB <b>${modelCache.size}</b> 種類（共有）<br>` +
      (ph ? `仮データ <b>${ph}</b> 着（シーズン・カテゴリ未設定）<br>` : '') +
      (kitStore.source.empty
        ? `データ ${escapeHtml(state.userSource?.label ?? kitStore.source.label)}：<b>${kitStore.size}</b> 着`
        : `データ ${escapeHtml(kitStore.source.name)}（読み取り専用）` +
      (state.userSource ? `＋追加分 <b>${kitStore.list().filter(k => kitStore.originOf(k.id) === 'user').length}</b> 着：${escapeHtml(state.userSource.label)}${state.userSource.writable ? '' : '（読み取り専用）'}` : '＋追加分の保存先なし')) +
      `<br>奥が古いシーズン、手前が新しいシーズン`;
    return;
  }
  const d = it.data; let tris = 0, meshes = 0;
  if (it.kitRoot) it.kitRoot.traverseVisible(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  const origin = kitStore.originOf(d.id);
  el.innerHTML = (d.thumbnailUrl ? `<img class="thumb" id="infoThumb" alt="${escapeHtml(d.name)} のサムネイル"><br>` : '') +
    `<b>${escapeHtml(d.name)}</b>${d.placeholder ? '（仮データ）' : ''}<br>` +
    `シーズン <b>${escapeHtml(d.season ?? '未設定')}</b>／カテゴリ <b>${escapeHtml(d.type ?? '未設定')}</b>` +
    (d.variant !== null ? `／<b>${escapeHtml(d.variant)}</b>` : '') + `<br>レールの手前から <b>${it.frontIndex + 1}</b> 番目（${items.length} 着中）<br>` +
    `ID ${escapeHtml(d.id)}<br>GLB ${escapeHtml(d.modelUrl)}${it.model?.foreign ? '（大きさ・位置を自動で合わせた GLB）' : ''}<br>` +
    `保存先 ${origin === 'user' ? escapeHtml(state.userSource.label) : origin === 'memory' ? 'なし（再読み込みで消えます）' : 'kits.json' + (kitStore.isEdited(d.id) ? `（シーズン・種別は編集済み：${escapeHtml(state.userSource.label)}）` : '')}<br>` +
    `表示中 <b>${meshes}</b> メッシュ／<b>${tris.toLocaleString()}</b> 三角形` +
    (sim.built ? `<br>布の計算 <b>${sim.n.toLocaleString()}</b> 点／固定 <b>${sim.pinned}</b> 点` : '');
  if (d.thumbnailUrl) resolveImageUrl(d.thumbnailUrl).then(u => { const img = document.getElementById('infoThumb'); if (img && state.selectedItem === it) img.src = u; }).catch(e => console.warn(e));
}
