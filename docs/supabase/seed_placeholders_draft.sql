-- 【下書き・まだ実行しない】仮データ 01〜07 を kits テーブルへ移す（フェーズ 4 で使う予定）
-- 前提：20261105000000_kit_archive.sql を適用済みであること
-- 元データ：apps/viewer/public/kits.json の 7 着 ＋ claude.ai 版で編集したシーズン・種別（data/artifact-export/kits/）
-- 実行する前に、下の <あなたのクラブの id> を clubs.id に置き換えること（select id, name from public.clubs; で確認できる）
-- source_id が同じものは二重に入らない（unique (club_id, source_id)）
insert into public.kits
  (club_id, source_id, name, season_label, season_start_year, kit_type, collar, display_color, is_placeholder, sort_hint)
select '<あなたのクラブの id>'::uuid, v.source_id, v.name, v.season_label, v.season_start_year, v.kit_type, v.collar, v.display_color, true, v.sort_hint
from (values
  ('placeholder-01', '仮データ 01', null,      null, null,    2,  '#6fa3d8', 1),
  ('placeholder-02', '仮データ 02', '2021-22', 2021, 'gk',    3,  '#20365f', 2),
  ('placeholder-03', '仮データ 03', '2020-21', 2020, 'home',  5,  '#e9e6dc', 3),
  ('placeholder-04', '仮データ 04', '2020-21', 2020, 'away',  12, '#b3262f', 4),
  ('placeholder-05', '仮データ 05', '2020-21', 2020, 'third', 13, '#d9b13b', 5),
  ('placeholder-06', '仮データ 06', '2020-21', 2020, 'cup',   9,  '#2f8a4a', 6),
  ('placeholder-07', '仮データ 07', '2020-21', 2020, 'gk',    1,  '#f1f1ec', 7)
) as v(source_id, name, season_label, season_start_year, kit_type, collar, display_color, sort_hint)
on conflict (club_id, source_id) do nothing;
