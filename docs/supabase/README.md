# Kit Archive のデータを Supabase に置く設計（Phase 3）

単体版（このリポジトリの `apps/viewer`）と ML_MyTeam の統合版が、同じ Supabase プロジェクト（ML_MyTeam が使っているもの）の同じデータを読み書きする。

- テーブルを作る SQL：ML_MyTeam リポジトリの `supabase/migrations/20261105000000_kit_archive.sql`（ブランチ `kit-archive-schema`）
  - Supabase の管理は ML_MyTeam 側でしているため、migration もそちらに置く
- **まだ適用していない。** 適用するかどうか・いつ適用するかはユーザーが決める

## 決まっていること（2026-11-05）
- 統合版・単体版とも、見るのも保存するのもログインが必要（個人用）。誰でも読める設定は作らない
- 単体版は ML_MyTeam の `seasons` にひも付けない。シーズンはキット自身に文字と開始年で持つ
- 既存の 2D 画像（`uniforms`）は残す。統合版のアーカイブページは 3D に置き換え、2D 画像はサムネイルとして使う

## テーブル `public.kits`（1着 = 1行）

| 列 | 型 | 内容 | kit-archive-core のデータ |
|---|---|---|---|
| `id` | uuid | 主キー | `id` |
| `club_id` | uuid → clubs | どのクラブのキットか（必須） | — |
| `season_id` | uuid → seasons（空可） | 統合版でひも付けるときだけ。シーズンを消すと空になる | — |
| `season_label` | text | 「2026-27」など。未設定は null | `season` |
| `season_start_year` | int（1850〜2100） | 並び順に使う。`season_label` と両方 null か両方あり | `seasonStartYear` |
| `kit_type` | text | home / away / third / cup / gk / null | `type`（Home など先頭大文字に直す） |
| `variant` / `variant_order` | text / int | 同じシーズン・種別の中での区別（任意） | `variant` / `variantOrder` |
| `sort_hint` | int | それでも同じときの並び | `sortHint` |
| `name` | text | 表示名（必須） | `name` |
| `model_key` | text | 3D の型紙。今は `standard` だけ | `modelUrl` / `modelUrlWorn`（アプリが同梱の GLB に読み替える） |
| `texture_path` | text | キット画像の置き場所（下のバケット内） | `display.texture`（署名付き URL にして読む） |
| `collar` | smallint（1〜13） | 襟 | `display.collar` |
| `display_color` | text | 画像がないときの色 | `display.color` |
| `display_scale` | numeric | 大きさ | `display.scale` |
| `hanger_visible` | boolean | ハンガーを表示するか | `hanger.visible` |
| `legacy_uniform_id` | uuid → uniforms（空可） | サムネイルに使う 2D 画像。画像を消すと空になる | `thumbnailUrl`（`uniforms.image_url` から） |
| `is_placeholder` | boolean | 仮データ | `placeholder` |
| `source_id` | text | 移行元の ID（`placeholder-01` など）。二重取り込み防止（クラブ内で一意） | — |
| `created_by` / `created_at` / `updated_at` | | 作った人・日時。`updated_at` はアプリが書く | `createdAt` / `updatedAt` |

- 同じシーズン・種別の重複は許可（画面で警告して確認する）。unique 制約は付けない
- 既存の `uniforms` には手を加えない

## キット画像のバケット `kit-textures`
- 非公開。PNG のみ・16MB まで（バケットの設定でも制限）
- パス：`<club_id>/<ファイル名>`。先頭のフォルダのクラブの所有者だけが読み書きできる
- 表示するときは署名付き URL（`createSignedUrl`）を作って読む

## 権限（RLS）
- `kits`：既存のテーブルと同じく、`clubs.owner_id = auth.uid()` のクラブの行だけ読み書きできる
  - 書き込むときは、ひも付ける `season_id` / `legacy_uniform_id` も同じクラブのものに限る
- `kit-textures`：上のとおり（select / insert / update / delete）

## 適用するときの手順（ユーザーが行う）
1. [check_before_kits_migration.sql](check_before_kits_migration.sql) を SQL Editor で実行し、すべて `ok = true` を確認（読み取り専用）
2. ML_MyTeam の `supabase/migrations/20261105000000_kit_archive.sql` の中身を SQL Editor で実行
3. 仮データを移すなら [seed_placeholders_draft.sql](seed_placeholders_draft.sql)（クラブの id を入れてから。フェーズ 4 で使う予定の下書き）

元に戻すとき（データも消える）：
```sql
drop table if exists public.kits;
drop policy if exists "kit_textures_owner_select" on storage.objects;
drop policy if exists "kit_textures_owner_insert" on storage.objects;
drop policy if exists "kit_textures_owner_update" on storage.objects;
drop policy if exists "kit_textures_owner_delete" on storage.objects;
-- バケットは、中のファイルをダッシュボードで消してから削除する
```

## 次（Phase 4）でアプリ側に足すもの
- `kit-archive-core` に Supabase 用の保存先（`SupabaseSource`）：`kits` の行 ⇔ core のデータの読み替え（上の表）と、キット画像のアップロード・署名付き URL
- 接続情報（URL・anon key）はコードに書かず、ビルド時の環境変数（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`。ML_MyTeam と同じ名前）から渡す
- 単体版のログイン画面（Supabase Auth。ML_MyTeam と同じアカウント）。クラブがない人の扱いは未定

## 不明・未確認
- Supabase 無料プランのストレージ容量・1ファイルの上限の正確な値（料金ページで確認が必要）
- `seasons.label` の書き方が「2026-27」形式か（統合版でひも付けるときに確認）
