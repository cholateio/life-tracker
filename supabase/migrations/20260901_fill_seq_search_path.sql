-- 20260901_fill_seq_search_path.sql
-- Pin the trigger function's search_path (Supabase linter
-- function_search_path_mutable): an unqualified table reference resolves
-- through the caller's search_path, which a role can point at a shadowing
-- schema. With search_path = '' every object must be schema-qualified —
-- pg_advisory_xact_lock lives in pg_catalog, which is always implicitly
-- searched, so only the table needs qualifying.

create or replace function fill_screenshot_seq() returns trigger as $$
begin
  if new.seq is null then
    perform pg_advisory_xact_lock(new.day_id);
    select coalesce(max(seq), 0) + 1 into new.seq
    from public.portfolio_game_screenshots
    where day_id = new.day_id;
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';
