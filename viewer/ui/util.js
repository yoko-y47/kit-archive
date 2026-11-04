// 画面（ui/）で共通に使う小さな関数
import { parseSeasonStartYear } from '../kit-data.js';

export const statusEl = document.getElementById('status');
export const setStatus = text => { statusEl.textContent = text; };
export const $ = id => document.getElementById(id);
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtMB = n => (n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1) + ' MB';
export function setFieldError(id, msg, input) {
  $(id).textContent = msg || '';
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
export function showNotice(el, html) { el.hidden = !html; el.innerHTML = html || ''; }

// ドロップ・クリックで選ぶ
export function wireDrop(drop, input, onFile) {
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('over');
    const files = e.dataTransfer.files;
    if (files.length > 1) { onFile(null, 'ファイルは1つだけ選んでください'); return; }
    if (files[0]) onFile(files[0]);
  });
}

// シーズン：「2026-27」「2026/27」「2026-2027」「2026」。開始年は先頭の4桁、終わりの年は開始年の翌年であること
export function checkSeason(text) {
  const t = text.trim();
  if (!t) return { error: 'シーズンを入力してください（例 2026-27）' };
  const m = t.match(/^(\d{4})(?:\s*[-/]\s*(\d{2}|\d{4}))?$/);
  if (!m) return { error: '「2026-27」または「2026」の形で入力してください' };
  const y = +m[1];
  if (y < 1850 || y > 2100) return { error: '開始年は 1850〜2100 の範囲で入力してください' };
  if (m[2]) {
    const end = m[2].length === 2 ? Math.floor(y / 100) * 100 + +m[2] + (+m[2] < y % 100 ? 100 : 0) : +m[2];
    if (end !== y + 1) return { error: `終わりの年は開始年の翌年（${y + 1}）にしてください` };
  }
  // 表記は「2026-27」にそろえる（1年のシーズンは「2026」）
  return { season: m[2] ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : String(y), year: parseSeasonStartYear(t) };
}
