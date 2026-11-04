// レール（ハンガーバー）とユニフォームの配置関係を一元管理する計算（3D 表示・データ保存には依存しない）
// 入力は並べ替え済みの配列（kit-data.js の sortKits の結果）。登録順は使わない。
//
// 座標：レールは z 方向。カメラの「正面」は +z 側から -z 方向を見るので、+z が手前・-z が奥。
// 手前から f 番目（0 始まり）のユニフォームは z = ((n - 1) / 2 - f) × spacing（展示範囲の中央が z = 0）

export const RAIL = Object.freeze({
  y: 1.62,          // レールの中心の高さ (m)
  radius: 0.013,    // 半径 (m)
  spacing: 0.22,    // ユニフォームの間隔 (m)。胴体の前後の厚み（最大約 0.18m）＋約 4cm
  extendFront: 1.5, // 展示範囲より手前に伸ばす長さ (m)
  extendBack: 25,   // 展示範囲より奥に伸ばす長さ (m)。霞で背景に溶けて半無限に続いて見える
  fadeFront: 1.2,   // 手前の端を透明にぼかす長さ (m)
  fadeBack: 12,     // 奥の端を透明にぼかす長さ (m)
  viewWindow: 10    // 視点を決めるとき、手前から何着分を画面に収めるか
});

// sortedKits: [{ id, ... }]（手前から順）
// 返り値：
//   slots: Map<id, { frontIndex, z }>   各ユニフォームを掛ける位置（フックの支点が乗る z）
//   rail: { zFront, zBack, length }     レールの範囲（端はぼかすので、展示範囲には入らない）
//   span: { zFront, zBack }             展示範囲（最も手前と最も奥のユニフォーム）
//   view: { targetZ, windowHalf }       視点の注視点の z と、画面に収める範囲の半分
export function computeRackLayout(sortedKits, rail = RAIL) {
  const n = sortedKits.length;
  const half = Math.max(0, n - 1) * rail.spacing / 2;
  const slots = new Map();
  sortedKits.forEach((kit, f) => slots.set(kit.id, { frontIndex: f, z: half - f * rail.spacing }));
  const span = { zFront: half, zBack: -half };
  const zFront = span.zFront + rail.extendFront, zBack = span.zBack - rail.extendBack;
  const w = Math.min(n, rail.viewWindow), windowHalf = Math.max(0, w - 1) * rail.spacing / 2;
  return {
    count: n,
    slots,
    span,
    rail: { zFront, zBack, length: zFront - zBack },
    view: { targetZ: span.zFront - windowHalf, windowHalf }
  };
}
// レール上の高さ：ハンガーのフックの内側の一番上（支点）をレールの上面に乗せる
export const railTopY = (rail = RAIL) => rail.y + rail.radius;
