-- Sightings previously had an unconditional public-read RLS policy, exposing each
-- row's raw user_id and exact (double-precision) latitude/longitude to anyone via
-- direct table reads. Lock the base table down to the sighting's own author or an
-- admin, and serve the public feed exclusively through a SECURITY DEFINER function
-- that projects only a sanitized, fixed column set.
--
-- Why a plain view (security_invoker) cannot do this: anon/authenticated do not have
-- rolbypassrls, so a security_invoker view would be subject to the same locked-down
-- RLS policy below and would return nothing to other users. This function instead
-- follows the same ownership-bypass-RLS pattern already used by
-- public.delete_customer_account: it is owned by postgres (rolbypassrls = true) and
-- declared SECURITY DEFINER, so it alone can see all non-expired rows, while the base
-- table remains inaccessible to anon/authenticated outside of their own rows. Its SQL
-- is fixed (no dynamic SQL, no caller-supplied column/filter list), so callers cannot
-- widen the projection to reach user_id or full-precision coordinates.

drop policy if exists "Public can read sightings" on public.sightings;

create policy "Owner or admin can read sightings"
  on public.sightings
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

create or replace function public.get_public_sightings()
returns table (
  id uuid,
  truck_name text,
  photo_url text,
  notes text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  expires_at timestamptz,
  spotted_by_name text,
  is_own_sighting boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.truck_name,
    s.photo_url,
    s.notes,
    round(s.latitude::numeric, 3)::double precision as latitude,
    round(s.longitude::numeric, 3)::double precision as longitude,
    s.created_at,
    s.expires_at,
    p.display_name as spotted_by_name,
    coalesce(auth.uid() = s.user_id, false) as is_own_sighting
  from public.sightings s
  left join public.profiles p on p.id = s.user_id
  where s.expires_at > now();
$$;

revoke all on function public.get_public_sightings() from public;
grant execute on function public.get_public_sightings() to anon, authenticated;

comment on function public.get_public_sightings() is
  'Public-safe sightings feed: excludes raw user_id, rounds coordinates to 3 decimal places (~111m), excludes expired rows. SECURITY DEFINER bypasses the owner/admin-only RLS on public.sightings by design — see migration comment.';
