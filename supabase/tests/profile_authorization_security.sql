\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user_id uuid := 'a3000000-0000-4000-8000-000000000001';
  v_role text;
  v_rejected boolean := false;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values (
    v_user_id,
    'authenticated',
    'authenticated',
    'profile-security-test@example.invalid',
    '',
    statement_timestamp(),
    statement_timestamp()
  );

  update public.profiles
  set role = 'customer',
      display_name = 'Before'
  where id = v_user_id;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  set local role authenticated;

  begin
    update public.profiles
    set role = 'admin'
    where id = auth.uid();
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'Authenticated customer self-promotion was not rejected';
  end if;

  select p.role
  into v_role
  from public.get_private_profile(auth.uid()) p;

  if v_role is distinct from 'customer' then
    raise exception 'Rejected self-promotion changed the stored role to %', v_role;
  end if;

  update public.profiles
  set display_name = 'After'
  where id = auth.uid();

  if not exists (
    select 1
    from public.get_private_profile(auth.uid()) p
    where p.display_name = 'After'
      and p.role = 'customer'
  ) then
    raise exception 'Normal self-profile update no longer works';
  end if;

  reset role;
end;
$$;

do $$
declare
  v_user_id uuid := 'a3000000-0000-4000-8000-000000000002';
  v_rejected boolean := false;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values (
    v_user_id,
    'authenticated',
    'authenticated',
    'profile-insert-security-test@example.invalid',
    '',
    statement_timestamp(),
    statement_timestamp()
  );

  -- Signup creates the ordinary customer profile. Remove it as the trusted
  -- test role so the adversarial client INSERT boundary can still be tested.
  delete from public.profiles
  where id = v_user_id;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  set local role authenticated;

  begin
    insert into public.profiles (id, role, display_name)
    values (v_user_id, 'admin', 'Injected Admin');
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'Authenticated elevated-role insert was not rejected';
  end if;

  if exists (
    select 1 from public.profiles p where p.id = auth.uid()
  ) then
    raise exception 'Rejected elevated-role insert created a profile';
  end if;

  reset role;
end;
$$;

rollback;
