-- 20260831_screenshot_seq_a.sql
-- Screenshot ordering moves from EXIF taken_at to a client-assigned upload
-- sequence: exported screenshots carry export time (1s resolution, heavy
-- collisions), so taken_at cannot order them.
-- Part A (expand): nullable column + backfill + view. Safe to run BEFORE the
-- app deploy — the old route inserts without seq and still succeeds.
-- Part B (20260831_screenshot_seq_b.sql) enforces NOT NULL after deploy.

alter table portfolio_game_screenshots add column seq integer;

-- Backfill with the order users currently see (taken_at asc nulls last, id).
update portfolio_game_screenshots s
set seq = r.rn
from (
  select id,
         row_number() over (partition by day_id order by taken_at asc nulls last, id asc) as rn
  from portfolio_game_screenshots
) r
where r.id = s.id;

-- Cover pick must follow the same order as the album. Body is byte-identical
-- to 20260826_gaming_record_v2.sql except the screenshot order by.
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
  order by dd.date asc, sc.seq asc nulls last, sc.id asc
  limit 1
) s on true;
