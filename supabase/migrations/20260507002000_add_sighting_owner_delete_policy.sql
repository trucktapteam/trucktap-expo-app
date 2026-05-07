do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Users can delete own sightings'
  ) then
    create policy "Users can delete own sightings"
    on public.sightings
    for delete
    using (auth.uid() = user_id);
  end if;
end $$;
