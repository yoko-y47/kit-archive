// 3D 表示（core）の各モジュールで共有するもの
// - ctx：描画・シーン・カメラ・操作（initViewer で一度だけ作る）
// - items：展示中のアイテム（1着＝1つ）
// - state：モジュールをまたいで書き換える状態
// - on / emit：画面（ui/）への通知。core は情報欄・ボタンなどの DOM を直接触らない
export const ctx = { renderer: null, scene: null, camera: null, controls: null, canvas: null, stage: null, options: null, cleanups: [] };
// createKitArchive の設定（index.js で既定値を入れる）
//   resolveModelUrls(path) → 試す URL の配列（先頭から順に読む）。アプリが GLB の置き場所に合わせて決める
//   background() → 背景色（CSS の色）。既定は CSS 変数 --stage
// 片付け（destroyViewer）で外すもの：イベントの登録・監視
export function listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); ctx.cleanups.push(() => target.removeEventListener(type, fn, opts)); }
export function track(dispose) { ctx.cleanups.push(dispose); }
export const items = [];
export const state = {
  selectedItem: null,      // 選択中（拡大中）のアイテム
  simItem: null,           // 布を計算しているアイテム
  grab: null,              // 掴んでいる布の点
  shape: 'hanging',        // 'hanging' | 'worn'
  lastCollar: 2,           // 最後に選んだ襟（新しく作るアイテムに使う）
  autoRotateWanted: false, // 「自動回転」のチェック
  showHanger: true,        // 「ハンガーを表示」のチェック
  showAxes: false,         // 「ハンガー基準点の軸を表示」のチェック
  rackLayout: null,        // rack-layout.js の計算結果
  userSource: null         // 追加分の保存先（kit-storage.js）
};
// 通知の種類：'hint'（操作の案内）'panel'（襟・情報欄）'info'（情報欄）'load'（読み込み状況）'shape' 'orbit'
const listeners = new Map();
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}
export function emit(type, ...args) { for (const fn of listeners.get(type) ?? []) fn(...args); }
export function clearListeners() { listeners.clear(); }
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
