# claude.ai アーティファクト版のデータ書き出し（2026-11-05）

書き出し元：https://claude.ai/artifact/D8JNknu2FdYJYMycPfdX8K （Version 26）の db コレクション `kits`

- `kits/placeholder-02〜07.json`：kits.json の仮データに対する「上書き」（`overridesBase: true`）。画面の「シーズン・種別を編集」で入れたシーズンと種別
- placeholder-01 は未編集（上書きなし）
- 画面から追加したユニフォーム：0 着。assets（キット画像）：0 ファイル

ブラウザの IndexedDB（ローカルで開いたときの保存先）の中身は、ここには含まれない。
Supabase へ移すときは、この JSON を新しい `kits` テーブルの初期データに使う。
