-- 20261106000000_kit_archives.sql（アーカイブ）を適用した後の確認
-- 読み取り専用：select だけで、テーブル・データ・設定は何も変えない。すべて ok = true なら適用できている
select * from (values
  ('kit_archives がある',                        exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kit_archives')),
  ('kit_archives の RLS が有効',                 coalesce((select relrowsecurity from pg_class where oid = 'public.kit_archives'::regclass), false)),
  ('すべてのキットがアーカイブに属している',     not exists (select 1 from public.kits where archive_id is null)),
  ('キットのクラブとアーカイブのクラブが同じ',   not exists (select 1 from public.kits k join public.kit_archives a on a.id = k.archive_id where k.club_id is distinct from a.club_id)),
  ('kits_archive_owner ポリシーがある',          exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kits' and policyname = 'kits_archive_owner')),
  ('古い kits_owner ポリシーはない',             not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kits' and policyname = 'kits_owner')),
  ('画像の新しいポリシーが 4 つある',            (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kit_textures_archive_%') = 4),
  ('画像の古いポリシーはない',                   not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kit_textures_owner_%')),
  ('上限のトリガーが 2 つある',                  (select count(*) from pg_trigger where tgname in ('kit_archives_limit', 'kits_limit')) = 2)
) as c(check_item, ok);
