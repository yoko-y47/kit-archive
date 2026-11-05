-- Kit Archive の migration（20261105000000_kit_archive.sql）を適用する前の確認
-- 読み取り専用：select だけで、テーブル・データ・設定は何も変えない
-- 使い方：Supabase ダッシュボード > SQL Editor に貼って Run。ok が false の行があれば、適用する前に知らせてください
select * from (values
  ('public.kits がまだない',                   not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kits')),
  ('バケット kit-textures がまだない',          not exists (select 1 from storage.buckets where id = 'kit-textures')),
  ('同じ名前のポリシーがまだない',              not exists (select 1 from pg_policies where policyname in ('kits_owner', 'kit_textures_owner_select', 'kit_textures_owner_insert', 'kit_textures_owner_update', 'kit_textures_owner_delete'))),
  ('clubs.owner_id がある',                    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clubs' and column_name = 'owner_id')),
  ('seasons.club_id がある',                   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seasons' and column_name = 'club_id')),
  ('uniforms.club_id がある',                  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'uniforms' and column_name = 'club_id')),
  ('storage.buckets にサイズ・形式の制限の列がある', exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types')
                                              and exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit')),
  ('gen_random_uuid が使える',                 exists (select 1 from pg_proc where proname = 'gen_random_uuid'))
) as c(check_item, ok);
