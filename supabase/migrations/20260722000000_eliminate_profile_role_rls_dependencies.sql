-- AUTH-001: Eliminate direct profiles.role dependencies from RLS policies.
--
-- Discovered while verifying CRIT-1 (20260721000000_secure_truck_creation.sql):
-- "Admins can update any truck" on public.trucks reads profiles.role inline
-- in its USING/WITH CHECK expression. 20260719010000_restrict_profile_data_
-- exposure.sql (unrelated, predates this fix) revoked table-level SELECT on
-- public.profiles from anon/authenticated and replaced it with column-level
-- grants that do not include role. RLS permission checks run as the
-- querying role, not the table owner, so any statement that must evaluate
-- that policy's qual now fails with "permission denied for table profiles"
-- -- for owners and admins alike, since Postgres must evaluate every
-- permissive policy's qual for a command even when a different policy would
-- independently grant access.
--
-- An audit of every RLS policy in the public schema found the identical
-- inline pattern -- EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
-- AND role = 'admin') -- repeated across 18 policies on 9 tables:
-- analytics_events, notification_logs, owner_message_reads, owner_messages,
-- review_replies, truck_checkins, truck_live_events, trucks, upcoming_stops.
-- Every one of them is broken the same way right now, not just trucks.
--
-- Fix: a single SECURITY DEFINER helper, public.is_admin(), that reads
-- profiles.role with the function owner's privileges (same bypass mechanism
-- already used by public.create_owned_truck, public.get_private_profile,
-- and private.require_supported_client -- postgres owns public.profiles,
-- and relforcerowsecurity is off, so the owner is exempt from both RLS and
-- the column-level grant restriction). Every policy below is altered to
-- call public.is_admin() instead of embedding the profiles lookup directly,
-- so no RLS policy anywhere depends on a client role being able to read
-- profiles.role again. This is a pure refactor: every replaced expression
-- is logically identical to what it replaces, only the profiles.role read
-- moves behind a trusted function boundary.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is
'Returns whether the calling session belongs to an admin account. SECURITY DEFINER so RLS policies can check profiles.role without granting authenticated/anon direct column access to it (AUTH-001).';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- analytics_events -----------------------------------------------------
alter policy "Truck owners and admins can read truck analytics events"
on public.analytics_events
using (
  (exists (
    select 1 from public.trucks t
    where t.id = analytics_events.truck_id and t.owner_id = auth.uid()
  ))
  or public.is_admin()
);

-- notification_logs -----------------------------------------------------
alter policy "notification_logs_admin_select"
on public.notification_logs
using (public.is_admin());

-- owner_message_reads -----------------------------------------------------
alter policy "Users can mark owner messages read"
on public.owner_message_reads
with check (
  (auth.uid() = user_id)
  and (
    public.is_admin()
    or (exists (
      select 1
      from public.owner_messages m
      join public.trucks t on t.owner_id = auth.uid()
      where m.id = owner_message_reads.message_id
        and (m.target_scope = 'all_trucks' or m.target_truck_id = t.id)
    ))
  )
);

alter policy "Users can update own owner message read receipts"
on public.owner_message_reads
with check (
  (auth.uid() = user_id)
  and (
    public.is_admin()
    or (exists (
      select 1
      from public.owner_messages m
      join public.trucks t on t.owner_id = auth.uid()
      where m.id = owner_message_reads.message_id
        and (m.target_scope = 'all_trucks' or m.target_truck_id = t.id)
    ))
  )
);

-- owner_messages -----------------------------------------------------
alter policy "Admins can send owner messages"
on public.owner_messages
with check (public.is_admin());

alter policy "Truck owners and admins can read owner messages"
on public.owner_messages
using (
  public.is_admin()
  or (exists (
    select 1 from public.trucks t
    where t.owner_id = auth.uid()
      and (owner_messages.target_scope = 'all_trucks' or owner_messages.target_truck_id = t.id)
  ))
);

-- review_replies -----------------------------------------------------
alter policy "Admins can delete review replies"
on public.review_replies
using (public.is_admin());

alter policy "Truck owners and admins can create review replies"
on public.review_replies
with check (
  deleted_at is null
  and owner_id = auth.uid()
  and length(btrim(body)) > 0
  and (exists (
    select 1
    from public.reviews r
    join public.trucks t on t.id = r.truck_id
    where r.id = review_replies.review_id
      and r.truck_id = review_replies.truck_id
      and (t.owner_id = auth.uid() or public.is_admin())
  ))
);

alter policy "Truck owners and admins can read managed review replies"
on public.review_replies
using (
  (exists (
    select 1 from public.trucks t
    where t.id = review_replies.truck_id and t.owner_id = auth.uid()
  ))
  or public.is_admin()
);

alter policy "Truck owners and admins can update review replies"
on public.review_replies
using (
  exists (
    select 1 from public.trucks t
    where t.id = review_replies.truck_id
      and (t.owner_id = auth.uid() or public.is_admin())
  )
)
with check (
  length(btrim(body)) > 0
  and (exists (
    select 1
    from public.reviews r
    join public.trucks t on t.id = r.truck_id
    where r.id = review_replies.review_id
      and r.truck_id = review_replies.truck_id
      and (t.owner_id = auth.uid() or public.is_admin())
  ))
);

-- truck_checkins -----------------------------------------------------
alter policy "Admins can view all checkins"
on public.truck_checkins
using (public.is_admin());

-- truck_live_events -----------------------------------------------------
alter policy "Admins can read all live events"
on public.truck_live_events
using (public.is_admin());

alter policy "Truck owners and admins can create live events"
on public.truck_live_events
with check (
  auth.uid() is not null
  and (actor_user_id is null or actor_user_id = auth.uid())
  and (
    (exists (
      select 1 from public.trucks t
      where t.id = truck_live_events.truck_id and t.owner_id = auth.uid()
    ))
    or public.is_admin()
  )
);

-- trucks -----------------------------------------------------
alter policy "Admins can update any truck"
on public.trucks
using (public.is_admin())
with check (public.is_admin());

-- upcoming_stops -----------------------------------------------------
alter policy "Public can read visible truck upcoming stops"
on public.upcoming_stops
using (
  (exists (
    select 1 from public.trucks t
    where t.id = upcoming_stops.truck_id
      and coalesce(t.archived, false) = false
      and t.archived_at is null
      and coalesce(t.is_test, false) = false
  ))
  or public.is_admin()
  or (exists (
    select 1 from public.trucks t
    where t.id = upcoming_stops.truck_id and t.owner_id = auth.uid()
  ))
);

alter policy "Truck owners and admins can create upcoming stops"
on public.upcoming_stops
with check (
  public.is_admin()
  or (exists (
    select 1 from public.trucks t
    where t.id = upcoming_stops.truck_id and t.owner_id = auth.uid()
  ))
);

alter policy "Truck owners and admins can delete upcoming stops"
on public.upcoming_stops
using (
  public.is_admin()
  or (exists (
    select 1 from public.trucks t
    where t.id = upcoming_stops.truck_id and t.owner_id = auth.uid()
  ))
);

alter policy "Truck owners and admins can update upcoming stops"
on public.upcoming_stops
using (
  public.is_admin()
  or (exists (
    select 1 from public.trucks t
    where t.id = upcoming_stops.truck_id and t.owner_id = auth.uid()
  ))
)
with check (
  public.is_admin()
  or (exists (
    select 1 from public.trucks t
    where t.id = upcoming_stops.truck_id and t.owner_id = auth.uid()
  ))
);
