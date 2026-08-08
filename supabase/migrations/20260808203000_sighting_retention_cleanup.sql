-- Enforce real retention for sightings. expires_at previously caused no deletion at
-- all, so exact location + a required photo were retained indefinitely for every
-- sighting ever submitted. Public visibility is 24h (set by the app at insert time,
-- see app/(customer)/add-sighting.tsx). This adds a 1-hour grace buffer past
-- expires_at (to avoid racing a client mid-interaction with a just-expired row),
-- then hard-deletes the row and best-effort purges its Storage photo. Row deletion
-- always proceeds regardless of whether the Storage purge succeeds.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.purge_expired_sightings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_key text;
  v_object_paths text[];
begin
  select array_agg(regexp_replace(photo_url, '^.*/truck-images/', ''))
    into v_object_paths
  from public.sightings
  where expires_at < now() - interval '1 hour'
    and photo_url like '%/truck-images/%';

  delete from public.sightings
  where expires_at < now() - interval '1 hour';

  if v_object_paths is null or array_length(v_object_paths, 1) is null then
    return;
  end if;

  select s.decrypted_secret
  into v_service_key
  from vault.decrypted_secrets s
  where s.name = 'storage_service_role_key'
  limit 1;

  if v_service_key is null or length(v_service_key) = 0 then
    raise warning
      'purge_expired_sightings: Vault secret storage_service_role_key is not configured, skipping Storage purge for % object(s)',
      array_length(v_object_paths, 1);
    return;
  end if;

  begin
    perform net.http_delete(
      url := 'https://spspobqzhdvsbeefecby.supabase.co/storage/v1/object/truck-images',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('prefixes', v_object_paths),
      timeout_milliseconds := 5000
    );
  exception
    when others then
      raise warning
        'purge_expired_sightings: Storage purge request failed for % object(s): %',
        array_length(v_object_paths, 1), sqlerrm;
  end;
end;
$$;

revoke all on function public.purge_expired_sightings() from public, anon, authenticated;

comment on function public.purge_expired_sightings() is
  'Deletes sightings rows past their 1-hour post-expiry grace window and best-effort purges their Storage photos. Requires Vault secret storage_service_role_key (a Storage-capable service_role key) to be provisioned out of band for the Storage purge step; row deletion happens regardless.';

do $$
declare
  has_pg_cron boolean;
  has_existing_job boolean := false;
begin
  has_pg_cron :=
    to_regnamespace('cron') is not null
    and to_regclass('cron.job') is not null
    and to_regprocedure('cron.schedule(text,text,text)') is not null;

  if has_pg_cron then
    execute 'select exists (select 1 from cron.job where jobname = $1)'
      into has_existing_job
      using 'purge_expired_sightings';

    if not has_existing_job then
      execute 'select cron.schedule($1, $2, $3)'
        using
          'purge_expired_sightings',
          '*/15 * * * *',
          'select public.purge_expired_sightings();';
    end if;
  else
    raise notice 'pg_cron is not enabled; public.purge_expired_sightings() was created but not scheduled.';
  end if;
end $$;
