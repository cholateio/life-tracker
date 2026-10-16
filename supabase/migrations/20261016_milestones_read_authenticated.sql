-- portfolio dropped its Milestone tab on 2026-10-16; the only remaining reader is
-- life-tracker's /milestone page, which reads as a signed-in user. Close anon reads.
drop policy "Enable read access for all users" on public.portfolio_milestones;

create policy "milestones_read_authenticated" on public.portfolio_milestones
    for select to authenticated using (true);
