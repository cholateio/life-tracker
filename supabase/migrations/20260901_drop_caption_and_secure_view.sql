-- 20260901_drop_caption_and_secure_view.sql
--
-- 1) Drop portfolio_game_screenshots.caption. It was a placeholder for a P2
--    fill-in UI that was never built: 38/38 rows were null and no code path
--    ever wrote it. Re-add the column together with the UI if the feature
--    comes back — an empty column is not a head start.
--
-- 2) security_invoker on the overview view. Without it a view runs with its
--    owner's privileges and bypasses RLS on the tables it reads (Supabase
--    flags this as UNRESTRICTED / security_definer_view). Behavior is
--    unchanged today because every underlying read policy is `using (true)`;
--    this closes the trap where a future tightening of those policies would
--    be silently ignored by the view.

alter table portfolio_game_screenshots drop column caption;

alter view portfolio_games_overview set (security_invoker = on);
