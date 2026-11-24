-- Gunita Kopi POS: real email for the Owner/Admin account (additive).
-- Owner signs in with a username, but the Supabase Auth identity uses a real email so
-- verification and password recovery work. Baristas keep the internal
-- <username>@staff.gunitakopi.local Auth identity and have no email stored here.

alter table public.users add column if not exists email text;

-- Normalize: trim, lowercase, empty string becomes NULL.
create function public.normalize_user_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end;
$$;

create trigger users_normalize_email
  before insert or update of email on public.users
  for each row execute function public.normalize_user_email();

-- Trigger-only function: nobody calls it directly.
revoke execute on function public.normalize_user_email() from public, anon, authenticated, service_role;

-- Case-insensitive uniqueness (NULLs never collide, so baristas are unaffected).
create unique index users_email_lower_key on public.users (lower(email));

-- Owner/Admin must have an email; baristas must not.
alter table public.users
  add constraint users_email_role_check check ((role = 'owner_admin') = (email is not null)),
  add constraint users_email_format_check check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- One-time Owner provisioning. Called only by the API (service role) after it creates the
-- Auth account. The advisory lock serializes concurrent setup requests; the second one sees
-- the first Owner and fails, and the API then deletes its orphan Auth account.
-- SECURITY INVOKER: service_role already has the table rights, so no privilege escalation.
create function public.provision_initial_owner(
  p_auth_user_id uuid,
  p_username     text,
  p_full_name    text,
  p_email        text
) returns public.users
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.users;
begin
  perform pg_advisory_xact_lock(hashtext('gunita.provision_initial_owner'));

  if exists (select 1 from public.users where role = 'owner_admin') then
    raise exception 'OWNER_EXISTS: the Owner account is already provisioned';
  end if;

  insert into public.users (auth_user_id, username, full_name, role, email)
  values (p_auth_user_id, p_username, p_full_name, 'owner_admin', p_email)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.provision_initial_owner(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_initial_owner(uuid, text, text, text)
  to service_role;

-- Signed-in staff may only change name and status (RLS still limits this to the Owner).
-- Role, email, username and the Auth link change only through the API (service role),
-- so nobody can grant themselves owner_admin or repoint a sign-in identity.
revoke update on public.users from authenticated;
grant update (full_name, status) on public.users to authenticated;

-- Keep users.email equal to the Owner's Auth email. Supabase changes auth.users.email only
-- after the new address is confirmed; sign-in (POST /api/auth/login) reads users.email.
-- SECURITY DEFINER because Supabase Auth (supabase_auth_admin) has no rights on public.users.
create function public.sync_owner_email_from_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.users
     set email = new.email
   where auth_user_id = new.id
     and role = 'owner_admin'
     and new.email is not null;
  return new;
end;
$$;

revoke execute on function public.sync_owner_email_from_auth() from public, anon, authenticated, service_role;

create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_owner_email_from_auth();

-- Privilege hardening. The default privileges of the migration role (postgres) in schema public
-- give authenticated TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on every new table. Staff need none.
-- Live has no GLOBAL default-privilege entries, so this schema-level entry is the one in effect.
-- Objects created by supabase_admin use that role's own defaults, which postgres cannot change.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
  end if;
end;
$$;
