-- kits が API（PostgREST）から見えないときの調査（2026-11-05）
-- 読み取り専用：select だけで、テーブル・データ・設定は何も変えない
-- 既存のテーブル titles と比べて、kits の置き場所と、API が使う役割（anon / authenticated）への権限を見る
select 'テーブル' as item, table_schema || '.' || table_name as detail
from information_schema.tables where table_name in ('kits', 'titles')
union all
select '権限 ' || table_name, grantee || ': ' || string_agg(privilege_type, ', ' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('kits', 'titles') and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by 1, 2;
