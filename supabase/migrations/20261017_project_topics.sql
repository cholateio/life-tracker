-- portfolio /project browses by topic instead of tech stack (2026-10-17).
-- Values are topic codes; the catalog (labels, order) lives in portfolio's
-- config/sitedata.js PROJECT_TOPICS, mirrored in app/project-record/page.jsx.
alter table public.portfolio_projects
    add column topics text[] not null default '{}';

update public.portfolio_projects set topics = '{idol-music}'           where slug in ('kamitsubaki-on-air', 'idol-media-aggregator', 'sekai-archive');
update public.portfolio_projects set topics = '{idol-music,visual}'    where slug in ('kaf-observatory', 'melody-matrix');
update public.portfolio_projects set topics = '{ai-workflow}'          where slug in ('multi-agent-starter', 'casepick');
update public.portfolio_projects set topics = '{ai-workflow,learning}' where slug in ('cholate-blog', 'yt-summary');
update public.portfolio_projects set topics = '{life-log}'             where slug in ('life-tracker', 'sleep-logs', 'nocturne', 'todo-list');
update public.portfolio_projects set topics = '{visual}'               where slug in ('swarm-clock', 'virtual-music-clock', 'masonry-image-gallery', 'differentiable-rendering');
update public.portfolio_projects set topics = '{learning}'             where slug = 'eureka';

-- Fail closed: an UPDATE whose slug matches nothing still "succeeds", and that
-- project would silently vanish from every topic page (codex review 2026-10-17).
do $$
begin
    if (select count(*) from public.portfolio_projects where topics <> '{}') <> 18
       or exists (select 1 from public.portfolio_projects where topics = '{}') then
        raise exception 'topics backfill mismatch: expected all 18 projects tagged';
    end if;
end $$;
