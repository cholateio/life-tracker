-- 20260831_screenshot_natural_key.sql
-- id was a redundant surrogate: nothing FK-references this table and
-- (day_id, hash) is already unique and NOT NULL — the dedup path has always
-- keyed on it. Dropping id removes the delete-induced number gaps that made
-- the table unreadable in the dashboard.
-- Ordering is unaffected: seq (NOT NULL since _seq_b) is the sort key; ties
-- now break on hash instead of id.
-- Run AFTER the app deploy: the deployed route addresses rows by
-- (day_id, hash) and answers a legacy ?id= call without querying the column,
-- so it behaves identically on both sides of this migration.
-- The view is replaced FIRST — its order by references sc.id, and that
-- dependency would otherwise block the drop.

create or replace view portfolio_games_overview as
select
  g.*,
  d.first_played_at,
  d.last_played_at,
  d.days_count,
  coalesce(g.cover_image, s.first_thumb) as cover_resolved
from portfolio_games g
left join lateral (
  select min(date) as first_played_at,
         max(date) as last_played_at,
         count(*)  as days_count
  from portfolio_game_days where game_id = g.id and is_draft = false
) d on true
left join lateral (
  select sc.thumb_url as first_thumb
  from portfolio_game_days dd
  join portfolio_game_screenshots sc on sc.day_id = dd.id
  where dd.game_id = g.id
  order by dd.date asc, sc.seq asc, sc.hash asc
  limit 1
) s on true;

alter table portfolio_game_screenshots drop constraint portfolio_game_screenshots_pkey;
alter table portfolio_game_screenshots drop constraint portfolio_game_screenshots_day_id_hash_key;
alter table portfolio_game_screenshots add primary key (day_id, hash);
alter table portfolio_game_screenshots drop column id;
