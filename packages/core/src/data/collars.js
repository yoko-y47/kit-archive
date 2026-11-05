// 襟の種類（GLB の collar_1〜collar_13）。名前は collar_mapping.json を目で見て付けた推定名
// データでは display.collar（1〜13。未設定は null で、表示は直前に選んだ襟）
export const COLLAR_COUNT = 13;
export const COLLAR_STYLES = Object.freeze({
  1: 'クルーネック', 2: 'Vネック', 3: '折り襟', 4: '折り襟＋前立て', 5: 'クルーネック（高め）',
  6: 'Vネック（高め）', 7: 'クルーネック', 8: 'クルーネック', 9: '丸首＋前立て', 10: '前開きの折り襟',
  11: '丸襟＋前立て', 12: 'ポロ襟＋前立て', 13: 'ポロ襟＋ボタン2個'
});
export const DEFAULT_COLLAR = 2;
