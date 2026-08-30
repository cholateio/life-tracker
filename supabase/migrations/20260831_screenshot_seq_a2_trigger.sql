-- 20260831_screenshot_seq_a2_trigger.sql
-- Part A2 (expand, follow-up to _a): server-side fill for the legacy path.
--
-- Clients whose bundle predates seq send none. Filling max+1 in the route is a
-- read-then-write race: that client uploads 3-wide, so concurrent requests read
-- the same max and persist duplicate seq (codex adversarial review 2026-08-31).
-- The per-day advisory lock serializes only the null-seq path, inside the
-- inserting transaction, so allocation is atomic without touching the normal
-- client-supplied path.
--
-- No unique (day_id, seq): two devices may legitimately supply the same seq,
-- and a 23505 there would be misread as the hash-collision retry. Ties break
-- by id, same as before.

create or replace function fill_screenshot_seq() returns trigger as $$
begin
  if new.seq is null then
    perform pg_advisory_xact_lock(new.day_id);
    select coalesce(max(seq), 0) + 1 into new.seq
    from portfolio_game_screenshots
    where day_id = new.day_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger fill_seq before insert on portfolio_game_screenshots
  for each row execute procedure fill_screenshot_seq();
