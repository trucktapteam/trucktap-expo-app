-- Legacy-data audit follow-up: restore the intended ON DELETE SET NULL
-- behavior on three actor/reporter foreign keys, and clean up the two
-- confirmed legacy rows those gaps left behind.
--
-- Part 1: public.sightings.user_id
-- 20260507001000_add_user_id_to_sightings.sql wrote
-- "references auth.users(id) on delete set null" as part of an
-- `add column if not exists user_id ...` statement. When a column already
-- exists, ADD COLUMN IF NOT EXISTS is a no-op for the whole column
-- definition -- including the ON DELETE clause -- so any environment where
-- this column pre-dated that migration silently kept NO ACTION instead.
-- Confirmed live via pg_get_constraintdef(): the deployed constraint has no
-- delete-action clause at all. Effect: public.delete_customer_account()
-- anonymizes analytics_events.user_id before deleting an account (it has no
-- FK at all) but relies on sightings' FK to do the equivalent -- which it
-- silently doesn't -- so deleting any account that ever filed a sighting
-- raises an unhandled FK violation and the whole deletion rolls back.
--
-- Part 2: private.owner_release_policy_audit.actor_user_id and
-- private.client_compatibility_policy_audit.actor_user_id
-- Both were declared "uuid not null references auth.users(id)" with no
-- delete clause at creation (20260717000000_owner_release_policy.sql,
-- 20260720000000_client_compatibility_policy.sql) -- the same NO ACTION gap
-- as sightings, on the same class of "who performed this" actor column that
-- every other such column in this schema (owner_messages.created_by,
-- truck_live_events.actor_user_id, owner_release_policy.updated_by,
-- client_compatibility_policy.updated_by) already handles with
-- ON DELETE SET NULL, preserving the audit row while releasing the actor
-- reference. NOT NULL must be dropped first since a column that can be
-- SET NULL on delete must itself be nullable. Both tables have zero rows
-- today, so this is a pure schema correction with no data to migrate.
--
-- Part 3: data cleanup for the two confirmed legacy rows.
-- Both statements are condition-scoped (not literal ID/environment
-- specific) and no-ops if the rows are already absent, so this migration is
-- safe to run in any environment, repeatedly.
--   * public.profiles: exactly one row still has the pre-"truck"-convention
--     role value 'owner' (see 20260721000000_secure_truck_creation.sql,
--     which deliberately scoped its own role repair to role = 'customer'
--     only, leaving any other existing role -- including this one --
--     untouched). Client code already normalizes 'owner' and 'truck'
--     identically (normalizeUserRole in contexts/AppContext.tsx), so this is
--     a consistency cleanup, not a behavior change.
--   * public.analytics_events: one row's user_id points at an auth.users row
--     that no longer exists (an account deleted before atomic account
--     deletion existed to anonymize this column, which has never had a
--     foreign key at all). Analytics data is internal-only and never
--     rendered to users.

-- ---------------------------------------------------------------------
-- Part 1: public.sightings.user_id
-- ---------------------------------------------------------------------
alter table public.sightings
  drop constraint if exists sightings_user_id_fkey;

alter table public.sightings
  add constraint sightings_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- Part 2: private audit-table actor FKs
-- ---------------------------------------------------------------------
alter table private.owner_release_policy_audit
  alter column actor_user_id drop not null;

alter table private.owner_release_policy_audit
  drop constraint if exists owner_release_policy_audit_actor_user_id_fkey;

alter table private.owner_release_policy_audit
  add constraint owner_release_policy_audit_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table private.client_compatibility_policy_audit
  alter column actor_user_id drop not null;

alter table private.client_compatibility_policy_audit
  drop constraint if exists client_compatibility_policy_audit_actor_user_id_fkey;

alter table private.client_compatibility_policy_audit
  add constraint client_compatibility_policy_audit_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- Part 3: legacy row cleanup (condition-scoped, safe to re-run)
-- ---------------------------------------------------------------------
update public.profiles
set role = 'truck'
where role = 'owner';

update public.analytics_events
set user_id = null
where user_id is not null
  and not exists (
    select 1 from auth.users u where u.id = analytics_events.user_id
  );
