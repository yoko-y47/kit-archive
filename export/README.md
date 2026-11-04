# kit_base.glb / kit_hanging.glb

- `kit_base.glb`: `nike2223_web.blend` から書き出したもの（人が着た形）
- `kit_hanging.glb`: `nike2223_hanging.blend` から書き出したもの（ハンガーに吊るした形）。ノード名・構成・userData・基準点は kit_base と同じです。生成方法は `phase2_tools/hanging/PARAMS.md` を参照してください

どちらもテクスチャは含みません。

## 書き出し設定
Blender 3.0 / glTF exporter 1.7.33
`export_apply=False`, `export_extras=True`, `export_yup=True`, カメラ・ライト・アニメーションなし

## 座標と基準点（Three.js 座標）
- 単位はメートルです。
- **正面は +Z** を向いています（Three.js の既定カメラから正面が見えます）。
- **原点 (0,0,0) はハンガーの基準点**で、肩の上端ラインの中央にあたります。ハンガーの位置にそのまま置けば掛かった状態になります。
  - 元の座標では (0, -0.006, 1.548) です（`kit_root.userData.anchor_in_original_coords`）。
- シャツは原点から下に約0.66m の範囲にあります（y = -0.66〜0）。

## ノード構成
```
kit_root
├─ shirt_out            (torso)          └─ Mesh_0046.001 (背面の裾)
├─ sleeves_short        (sleeves, short)
├─ Mesh_0054 / Mesh_0050 / Mesh_0052  (sleeves, long)
└─ collar_1 … collar_13 (collar_id 1〜13)  ※3,4,12,13 は子パーツ付き
```
各ノードの `userData` には `kit_part`, `collar_id`, `exclusive_group`, `sleeve_type` が入っています。

## 表示ルール
- 襟は `collar_1`〜`collar_13` のうち**必ず1つだけ** `visible=true` にします。子パーツは親と一緒に切り替わります。
- 袖は**半袖に統一**しています（`sleeves_short` だけを表示）。長袖のパーツ（`Mesh_0054`, `Mesh_0050`, `Mesh_0052`）は GLB には残っていますが、ビューアでは表示しません。
- 読み込んだ直後は全パーツが表示状態です。最初に上のルールで表示を絞り込んでください。
- マテリアル `Kit` にはテクスチャが入っていません。キットごとに `map` を差し替える前提です。UVのV座標は 1〜2 の範囲にあるので、テクスチャは RepeatWrapping（既定）のまま使ってください。
- `Mesh_0052` はテクスチャが参照切れのマテリアル（`Tex_0341_0_dds`）を使っています。

```js
// 例
const root = gltf.scene.getObjectByName('kit_root');
function setCollar(id) {
  for (let i = 1; i <= 13; i++) root.getObjectByName('collar_' + i).visible = (i === id);
}
root.traverse(o => { if (o.userData.sleeve_type) o.visible = (o.userData.sleeve_type === 'short'); });
setCollar(2);
```

## 確認用ビューア
公開版: https://claude.ai/artifact/D8JNknu2FdYJYMycPfdX8K

### 構成とビルド（Phase 2）
npm workspaces。ルートで `npm install` のあと：
- `npm run dev`：単体版を開発用サーバーで開く（apps/viewer）
- `npm run build`：単体版を `apps/viewer/dist/` に書き出す（GitHub Pages などにそのまま置ける。`base: './'`）
- `npm run build:artifact`：claude.ai 公開用を `apps/viewer/dist-artifact/` に書き出す。GLB は配信できないため `models/*.glb.b64.txt` に置き換え、ページの骨組み（doctype〜body）を外す（`apps/viewer/scripts/build-artifact.mjs`）。公開は `dist-artifact/index.html` をページ、`assets/*.js`・`kits.json`・`models/*.b64.txt` を同じ相対パスのファイルとして載せる
- GLB を作り直したら `export/*.glb` を `apps/viewer/public/models/` にコピーしてからビルドする

- `packages/core`（`kit-archive-core`）：3D 展示とデータ管理。ビルド不要の ES モジュールで、`three`（0.160.0）は使う側が入れる
  - 入口 `src/index.js`：`createKitArchive(要素, { store, resolveModelUrls, background })` → `{ select(id), deselect, flip, setView, setOrbit, setShape, setCollar, setHangerVisible, setAxesVisible, setAutoRotate, setTexture, shake, toggleWind, setPhysics, setUserSource, on(種類, fn), destroy }`
    - `store`：`KitStore`（必須）。`resolveModelUrls(path)`：GLB の参照先 → 試す URL の配列（既定はそのまま）。`background()`：背景色（既定は CSS 変数 `--stage`）
    - 3D 展示は1ページに同時に1つ。`destroy()` で描画ループ・イベントの登録・通知・読み込んだモデルを片付け、canvas を外す（React の画面から外すときなど）。そのあと作り直せる
    - 通知（`on`）：'hint'（操作の案内）'panel'（襟・情報欄）'info'（情報欄）'load'（読み込み状況）'shape' 'orbit'
  - データ管理（3D に依存しない）も同じ入口から使える：`KitStore`・`JsonFileSource`・`compareKits`・`computeRackLayout`・保存先（`IndexedDbSource` / `ClaudeArtifactSource` / `openUserSource`）など
  - `src/data/kit-data.js`：データ構造の正規化・検証・並び順と、`KitStore`（追加・更新・削除と変更通知）。保存先（source）は差し替え式。データベースにつなぐときは同じ形の source を作って渡す。接続情報はコードに書かない
  - `src/data/rack-layout.js`：配置計算。並べ替え済みの配列から、各ユニフォームの位置・レールの範囲・視点を返す `computeRackLayout`
  - `src/data/sources/kit-storage.js`：追加分の保存先（IndexedDB / claude.ai）
  - `src/viewer/`（Phase 1 で index.html から切り出した 3D 展示。DOM は表示先の要素だけを使い、画面への反映は通知で行う）
    - `context.js`：共有するもの（描画・シーン・カメラ・操作の `ctx`、展示中の `items`、選択などの `state`）と通知
    - `viewer.js`：描画・光・カメラを作り、ラック・入力・描画ループを始める（`initViewer` / `destroyViewer`）
    - `view.js`：視点（正面・斜め・横・背面、回転の向き）。`rack.js`：ハンガーバー・床・霞と、掛ける位置
    - `display-items.js`：展示アイテムの位置・向き・大きさ、選択・前後の切り替え・ラックへ戻る動き
    - `kits.js`：データ1件と展示アイテムの対応（モデルの付け替え・テクスチャ・色・襟・形状）と、ストアの変更通知の受け取り
    - `models.js`：GLB の読み込み（パスごとに1回）。`hanger.js`：ハンガーの形。`cloth.js`：布の揺れ。`input.js`：クリックとドラッグ
- `apps/viewer`（単体版ビューア）：`index.html`（HTML と CSS）、`src/main.js`（組み立て）、`src/ui/`（`panel.js` 操作パネル・情報欄、`add-dialog.js` と `preview.js` 追加画面、`edit-dialog.js` 編集画面、`util.js`）、`public/`（`kits.json`、`models/*.glb`）
  - GLB の参照先はファイル名で `public/models/` のものに読み替える（`src/main.js` の `resolveModelUrls`）。以前のデータの `../export/kit_hanging.glb` もそのまま読める

### ハンガーバーと複数ユニフォーム（Phase 4）
- 1着分のデータ（`kits.json` の `kits[]`、schemaVersion 3）
  - `id`（必須・一意）、`season`（"2026-27" など。未設定は null）、`seasonStartYear`（数値。省略時は season の最初の4桁）、`name`、`type`（Home / Away / Third / Cup / GK。未設定は null）、`variant`（任意）、`modelUrl`（必須。GLB の参照先）、`thumbnailUrl`（任意）、`hanger`（`{ visible }`）
  - 任意：`variantOrder`、`modelUrlWorn`（着用形の GLB）、`display`（`collar` / `color` / `texture` / `scale`）、`placeholder`（仮データ）、`sortHint`、`createdAt` / `updatedAt`
  - 旧形式（`glb` / `glbWorn` / `seasonStart` / 直下の `collar` / `color`）も読める
  - 公開版（claude.ai）では GLB を配信できないため、`models/` の同じファイル名の `*.glb.b64.txt` を読む
- 並び順（登録順には依存しない。`compareKits`）。手前から：
  1. `seasonStartYear` が新しい順（数値で比較。未設定は一番奥）
  2. 同じシーズン内は Home(0) → Away(1) → Third(2) → Cup(3) → GK(4)（固定値 `CATEGORY_ORDER`。未設定・一覧外は一番奥）
  3. 同じカテゴリ内は `variant` なし → `variantOrder` → `variant` の名前順
  4. それでも同じなら `sortHint` → `id`
  - 同じシーズン・同じカテゴリの複数登録はできる（`variant` で区別するのが基本）。登録できないのは `id` の重複、`modelUrl` なし、開始年が読めないシーズン（コンソールに理由）
- 展示位置（`computeRackLayout`）：手前から f 番目は z = ((着数-1)/2 - f) × 0.22m。レールは展示範囲の手前 1.5m〜奥 25m。追加・更新・削除のたびに計算し直し、位置が変わるユニフォームは滑らかに移動する
- 今の7枚（`placeholder-01`〜`07`）は仮データ。実物のシーズン・カテゴリが未確認のため `season` / `type` は null にし、移行前の表示順は `sortHint` で保っている
- 座標の向き：カメラの「正面」は +z 側から -z 方向を見る。手前＝+z、奥＝-z
- ラックは奥行き方向（z）に伸びる金属のハンガーバー1本だけ（高さ 1.62m、直径 2.6cm）。脚・支柱・補強材はない。固定で、回転も移動もしない
- バーの長さは「展示範囲（(着数-1)×22cm）＋手前 1.5m＋奥 25m」。追加・削除のたびに作り直すので、着数に合わせて伸び縮みし、端が展示範囲に入ることはない
- 終端を目立たせない工夫：バーの両端を透明にぼかす（手前 1.2m・奥 12m）＋背景と同じ色の霞（カメラから注視点までの距離＋2.5m で始まり＋16m で背景に溶ける）。霞で完全に見えなくなったユニフォームは描かない
- 視点：手前から最大 10 着分が収まる位置を注視点にする（100着以上でも手前の展示が小さくならない）。奥へは右ドラッグ（パン）で移動する。ズームアウトは 25m まで
- 実行中の追加・更新・削除：`kitStore.add({...})` / `update(id, 変更)` / `remove(id)`（今は確認用の `window.__kit` から呼べる。保存先が読み取り専用なので、ページを閉じると消える）。既存のユニフォームは新しい位置へ滑らかに移動する。選択中のユニフォームは、選択を解除したときに新しい位置へ戻る
- 各ハンガーは、フックの内側の一番上がバーの上面に乗る位置に掛けるので、全員の高さがそろう
- 読み込み：同じ GLB は1回だけ取得し（パスごとにキャッシュ）、各ユニフォームは複製を使う。形状とハンガーの形状は全員で共有し、色を変えるマテリアルだけ1着ごとに複製する。手前（新しいシーズン）から順に読み込む
- 布の揺れは、選択中（とラックへ戻る途中）の1着だけ計算する。そのときだけ形状を複製し、ラックに戻り終わったら共有の形状に戻して複製を破棄する。「揺らす」「風」、シャツを引っ張る操作も選択中の1着に効く
- クリック判定は、先にアイテムごとの境界箱で候補を絞ってからメッシュを調べる
- 襟ボタン・テクスチャ：選択中のユニフォームに適用。選択していないときは全ユニフォームに適用
- 視点ボタン：「斜め」（初期）・「正面」・「横」・「背面」

### ユニフォームの追加（Phase 6-A。入力を「シーズン・種別・キット画像」に絞った版）
- 展示の右上の「＋」から追加画面を開く。入力は3つだけ（すべて必須）：シーズン（「2026-27」「2026/27」「2026」。保存時は「2026-27」にそろえる）・種別・キット画像（PNG、16MB まで）
- GLB は自動：標準のユニフォーム（吊り下げ形 `../export/kit_hanging.glb`、着用形 `../export/kit_base.glb`）を全員共通で使い、キット画像をテクスチャとして貼る（`display.texture`）。画像は「テクスチャ差し替え」と同じ UV 配置のもの。縦横の大きさが違うと注意を出す
- 名前は自動で「シーズン 種別」（例 `2026-27 Home`）。同じシーズン・種別がすでにあると警告を出し、もう一度押すと「`2026-27 Home (2)`」として登録する（重複は許可）
- 追加画面を開くと標準の GLB を展示と同じ処理で読み込み、別の小さな 3D 表示でプレビューする。PNG を選ぶとそれを貼って見せる（展示の選択・視点には触れない）
- ID は `kit-<開始年>-<種別>-<乱数8桁>`。登録後はストアの通知で並べ直し、レールの長さ・位置を計算し直す（選択中のユニフォームはそのまま）
- 保存先（`packages/core/src/data/sources/kit-storage.js`）。保存するファイルはキット画像だけ（GLB は保存しない）
  - claude.ai で開いたとき：アーティファクトの db（`kits/<id>`）と assets（`asset:<id>`）。書き込めるのは編集権限のある人だけ
  - それ以外（ローカル・サインインしていない表示）：このブラウザの IndexedDB `kit-archive`（`kits` と `files`、`idb:<id>`）。その端末・そのブラウザだけ
  - 順番は「画像 → データ」。データの保存に失敗したら、保存済みの画像を消して展示には加えない
- 以前の版で GLB ごと登録したデータ（`modelUrl` が `idb:` / `asset:`）も、そのまま読み込める
- kits.json の 7 着は読み取り専用のまま。追加分は読み込み後に後から加える

### シーズン・種別の編集
- ユニフォームを選ぶと、情報欄に「シーズン・種別を編集」が出る（保存先に書き込めるときだけ）。シーズンは追加と同じ書き方で、空欄なら未設定。種別は Home〜GK か未設定
- 仮データ（kits.json の分）は kits.json を書き換えない。変えた項目（season / seasonStartYear / type）だけを、追加分と同じ保存先に「上書き」として保存する（`{ id, overridesBase: true, season, seasonStartYear, type, updatedAt }`）。読み込むたびに kits.json の内容へ重ねる
- 追加したユニフォームは、そのデータを書き換える。名前が自動で付けたもの（「シーズン 種別」）なら付け直す
- 保存後はレールを並べ直す（選択中のユニフォームはそのまま）

### 展示アイテムと選択（Phase 3）
- 1着を `createDisplayItem(id, { pos, yaw, scale })` で作る展示アイテムとして管理する（Phase 4 からは kits.json の1件ごとに作る）。構成は `group`（位置・向き・大きさをアニメーション）→ `offset`（ユニフォームの中央を回転・拡大の中心にするずらし）→ `content`（シャツ＋ハンガー、中の座標は従来どおり「原点＝ハンガー基準点」）。選択対象は `group.userData.displayItem` で識別し、ファイル名やメッシュ名には依存しない
- 布の計算・ハンガーの合わせ込み・布を掴む操作は `content` 座標で行うので、アイテムを動かしても計算は変わらない
- ユニフォーム（ハンガー含む）をクリック：視線の先の画面中央へ移動し、模型を 1.15倍にしてハンガーを含む全体が画面の 82% に収まる距離に置き、正面をカメラに向ける
- 拡大中にクリック：ユニフォームの中央を通る縦軸で 180° 回して前後を切り替える。回転中に押しても、今の角度から新しい向きへ続けて回る
- 背景クリック／Esc：元の位置・大きさ・向きへ戻る。「正面」「横」「背面」ボタンを押したときも先に戻す
- 動きはすべて臨界減衰ばね（約0.7秒で落ち着く）。途中で目標が変わっても位置・速度が連続する。拡大中はカメラ操作と自動回転を止める
- クリックとドラッグの区別：押してから 6px 未満で離したらクリック。ユニフォーム上で 6px 以上動かしたら布を引っ張る（布の計算がない着用形やハンガー部分では、その時点からカメラ操作に切り替える）。背景のドラッグは従来どおりカメラ操作
- 前後切り替えの回転は、ドラッグで視点を回したときと同じく布に回転の慣性としてかかる（裾や袖が少し遅れてなびく）

### 視点の回転
「自由に回転」（上下左右）と「左右だけ回転」を切り替えられる。「左右だけ回転」では、視点の高さを「正面」ボタンと同じ高さ（シャツの中心から +15cm、距離 1.9m）に固定し、ドラッグでは水平方向にだけ回る。

### 布の揺れ（吊り下げ形のみ）
ビューアは、表示中の胴体・裾・袖・襟を縫い目で1枚の布にまとめ、ブラウザ上でクロスシミュレーションします（Position Based Dynamics）。
- 静止形は kit_hanging.glb の形そのもので、肩上端（約200点）を固定する
- 「揺らす」ボタン: ハンガーごと前後に約8〜12°揺れる（振り子の長さ約35cm、減衰あり）
- 「風」ボタン: 前から弱い風を当てる
- シャツをドラッグすると布を引っ張れる
- 背景をドラッグして視点を横に回すと、シャツをハンガーごとフックの軸まわりに回したものとして、布に回転の慣性（遠心力・回転の加減速による力・コリオリの力）をかける。裾や袖が回転に遅れてなびき、止めると揺り戻す（角速度は最大 6 rad/s、角加速度は最大 40 rad/s² で頭打ち。「正面」などのボタンで視点が飛んだときは無視）
- 計算量: 半袖 2,098点（約9〜15ms/フレーム）。内蔵ブラウザの非表示状態で計測
- 袖と胴体の当たり判定: 胴体を高さ2cmごとの楕円柱で近似し、袖が内側に入ったら表面へ押し戻す（布同士の正確な衝突ではないため、肩まわりや強く引っ張ったときは多少めり込むことがある）
- ハンガーはブナ材のスーツハンガー（ズボン掛けのバー付き・つや消しアルミのフック）。参考写真の正面シルエット（木部の上端・下端、フックの芯線）を画像から測って再現している（全幅 41cm）。前後の厚みは写真にないので、ブロック 4.2cm・肩先 4.8cm を基本に、肩では布の前後に 1.2cm ずつ、首まわりでは全13種の襟から 4mm 以上の余裕を残すよう自動で細くする
- 置く高さは、腕の上端が肩の布の 1.2cm 下に収まる一番高い位置（輪郭の形そのものは変えない）。支点はフックの一番高い所の内側

注意: Three.js はノード名から "." を除去します（`Mesh_0046.001` → `Mesh_0046001`）。`userData` で判定すれば影響を受けません。
