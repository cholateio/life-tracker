-- gaming-record v2 (docs/specs/gaming-record-v2.md §2)
-- Rebuilds portfolio_games (old data intentionally discarded) and creates the
-- day/screenshot tables + overview view. Run once in Supabase SQL editor.

create extension if not exists moddatetime;

drop view if exists portfolio_games_overview;
drop table if exists portfolio_game_screenshots;
drop table if exists portfolio_game_days;
drop table if exists portfolio_games cascade;

-- §2.1
create table portfolio_games (
  id               bigint generated always as identity primary key,
  title            text not null,
  -- route-safe: a slug must address /collection/game/[slug] as one segment
  slug             text not null unique check (slug <> '' and slug !~ '[/?#[:space:]]'),
  platform         text,
  studio           text,
  release_date     date,
  counter_label    text,
  activity_options text[] not null default '{}',
  rating           smallint check (rating between 1 and 10),
  total_hours      numeric(6,1),
  is_favorite      boolean not null default false,
  cover_image      text,
  purchase         jsonb,
  bookmark         jsonb,
  final_note       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- §2.2
create table portfolio_game_days (
  id            bigint generated always as identity primary key,
  game_id       bigint not null references portfolio_games(id) on delete cascade,
  date          date not null,
  temperature   text check (temperature in ('high','stuck','lost','wow','chill')),
  counter_value bigint,
  progress_note text,
  activities    text[] not null default '{}',
  one_line      text check (char_length(one_line) <= 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (game_id, date)
);

-- §2.3
create table portfolio_game_screenshots (
  id           bigint generated always as identity primary key,
  day_id       bigint not null references portfolio_game_days(id) on delete cascade,
  original_url text not null,
  view_url     text not null,
  thumb_url    text not null,
  hash         text not null,
  taken_at     timestamptz,
  caption      text,
  created_at   timestamptz not null default now(),
  unique (day_id, hash)
);

create trigger set_updated_at before update on portfolio_games
  for each row execute procedure moddatetime (updated_at);
create trigger set_updated_at before update on portfolio_game_days
  for each row execute procedure moddatetime (updated_at);

-- §2.4  derived fields live here, never in columns
create view portfolio_games_overview as
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
  from portfolio_game_days where game_id = g.id
) d on true
left join lateral (
  select sc.thumb_url as first_thumb
  from portfolio_game_days dd
  join portfolio_game_screenshots sc on sc.day_id = dd.id
  where dd.game_id = g.id
  order by dd.date asc, sc.taken_at asc nulls last, sc.id asc
  limit 1
) s on true;

-- §2.5  known tradeoff: anon read stays open (cookie gate is UI-only)
alter table portfolio_games enable row level security;
alter table portfolio_game_days enable row level security;
alter table portfolio_game_screenshots enable row level security;

create policy games_read  on portfolio_games for select using (true);
create policy games_write on portfolio_games for all to authenticated
  using (true) with check (true);

create policy days_read  on portfolio_game_days for select using (true);
create policy days_write on portfolio_game_days for all to authenticated
  using (true) with check (true);

create policy shots_read  on portfolio_game_screenshots for select using (true);
create policy shots_write on portfolio_game_screenshots for all to authenticated
  using (true) with check (true);
