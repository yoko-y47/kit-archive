-- Kit Archive の migration（20261105000000_kit_archive.sql）を適用した後の確認
-- 読み取り専用：select だけで、テーブル・データ・設定は何も変えない
-- 使い方：Supabase ダッシュボード > SQL Editor に貼って Run。すべて ok = true なら適用できている
select * from (values
  ('kits テーブルがある',                     exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kits')),
  ('kits の列が 22 個ある',                   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kits') = 22),
  ('kits の RLS が有効',                      coalesce((select relrowsecurity from pg_class where oid = 'public.kits'::regclass), false)),
  ('kits_owner ポリシーがある',               exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kits' and policyname = 'kits_owner')),
  ('kits は空（まだデータを入れていない）',    (select count(*) from public.kits) = 0),
  ('バケット kit-textures が非公開',           exists (select 1 from storage.buckets where id = 'kit-textures' and public = false)),
  ('バケットは PNG・16MB まで',                exists (select 1 from storage.buckets where id = 'kit-textures' and file_size_limit = 16777216 and allowed_mime_types = array['image/png'])),
  ('画像のポリシーが 4 つある',               (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kit_textures_owner_%') = 4),
  ('既存の uniforms はそのまま（列 6 個）',     (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'uniforms') = 6)
) as c(check_item, ok);
