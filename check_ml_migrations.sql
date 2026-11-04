-- ML_MyTeam の migration（supabase/migrations の 21 本）が本番 DB に反映済みかを確かめる
-- 読み取り専用：select だけで、テーブル・データ・設定は何も変えない
-- 使い方：Supabase ダッシュボード > SQL Editor に貼って Run。applied が false の行が未反映
with col(t, c) as (
  select table_name, column_name from information_schema.columns where table_schema = 'public'
), con(name, def) as (
  select conname, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
)
select * from (values
  ('20260922000000_core_schema',               exists (select 1 from col where t = 'titles')),
  ('20260923000000_season_current_unique',     exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'seasons_one_current_per_club')),
  ('20260924000000_player_fields',             exists (select 1 from col where t = 'squad_memberships' and c = 'position_sub')),
  ('20260925000000_contract_end_date',         exists (select 1 from col where c = 'contract_end_date')),
  ('20260926000000_news_and_club_details',     exists (select 1 from col where t = 'news') and exists (select 1 from col where t = 'clubs' and c = 'stadium_name')),
  ('20260926150000_squad_status_youth_promoted', exists (select 1 from con where name = 'squad_memberships_status_check' and def like '%youth_promoted%')),
  ('20260927000000_coaches_and_youth_status',  exists (select 1 from col where t = 'coaches')),
  ('20260927010000_squad_status_b_registered', exists (select 1 from con where name = 'squad_memberships_status_check' and def like '%b_registered%')),
  ('20260927020000_player_promoted_year',      exists (select 1 from col where t = 'players' and c = 'promoted_year')),
  ('20260927030000_transfers_season_optional', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transfers' and column_name = 'season_id' and is_nullable = 'YES')),
  ('20260927040000_transfer_type_loan_end',    exists (select 1 from con where name = 'transfers_transfer_type_check' and def like '%loan_end%')),
  ('20260928000000_uniforms',                  exists (select 1 from col where t = 'uniforms') and exists (select 1 from storage.buckets where id = 'uniforms')),
  ('20260929000000_player_joined_year',        exists (select 1 from col where t = 'players' and c = 'joined_year')),
  ('20260930000000_player_photos_bucket',      exists (select 1 from storage.buckets where id = 'player-photos')),
  ('20261001000000_player_en_names',           exists (select 1 from col where t = 'players' and c = 'given_name_en')),
  ('20261002000000_news_images_bucket',        exists (select 1 from storage.buckets where id = 'news-images')),
  ('20261003000000_coach_photos_bucket',       exists (select 1 from storage.buckets where id = 'coach-photos')),
  ('20261004000000_coach_en_names',            exists (select 1 from col where t = 'coaches' and c = 'given_name_en')),
  ('20261005000000_match_detailed_stats',      exists (select 1 from col where t = 'match_substitutions')),
  ('20261006000000_match_goals_opponent',      exists (select 1 from col where t = 'match_goals' and c = 'opponent_scorer_name')),
  ('20261009000000_match_cards_opponent',      exists (select 1 from col where t = 'match_cards' and c = 'opponent_player_name'))
) as m(migration, applied)
order by migration;
