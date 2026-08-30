-- 20260831_screenshot_seq_b.sql
-- Part B (contract): run ONLY after the app deploy, i.e. once every writer
-- either sends seq or goes through the fill_seq trigger.
--
-- App rollback past this point: first
--   alter table portfolio_game_screenshots alter column seq drop not null;
-- then redeploy the old app.

-- Rows written with a null seq (possible only before _a2's trigger existed)
-- were displayed nulls-last by id; append them after each day's current max so
-- the visible order does not change.
update portfolio_game_screenshots s
set seq = r.base + r.rn
from (
  select n.id,
         coalesce((select max(seq) from portfolio_game_screenshots m where m.day_id = n.day_id), 0) as base,
         row_number() over (partition by n.day_id order by n.id asc) as rn
  from portfolio_game_screenshots n
  where n.seq is null
) r
where r.id = s.id and s.seq is null;

alter table portfolio_game_screenshots alter column seq set not null;
