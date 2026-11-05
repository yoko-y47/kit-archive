-- 20261106000000_kit_archives.sql（アーカイブ）を適用する前の確認
-- 読み取り専用：select だけで、テーブル・データ・設定は何も変えない。すべて ok = true なら適用できる
select * from (values
  ('kit_archives がまだない',                    not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kit_archives')),
  ('kits に archive_id がまだない',               not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kits' and column_name = 'archive_id')),
  ('kits の一意制約 kits_club_id_source_id_key がある', exists (select 1 from pg_constraint where conname = 'kits_club_id_source_id_key')),
  ('kits_owner ポリシーがある',                   exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kits' and policyname = 'kits_owner')),
  ('画像の古いポリシーが 4 つある',               (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kit_textures_owner_%') = 4),
  ('上限の関数がまだない',                       not exists (select 1 from pg_proc where proname in ('kit_archives_limit', 'kits_limit'))),
  ('クラブに属さないキットはない',               not exists (select 1 from public.kits where club_id is null))
) as c(check_item, ok);
