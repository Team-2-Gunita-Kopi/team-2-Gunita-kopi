-- Gunita Kopi POS: Owner sign-in is password, then a 6-digit code emailed by Supabase Auth.
-- Replaces the TOTP rule of 20261120000000 (aal2), which this sign-in never reaches: Supabase has no
-- email MFA factor, so the code is a separate email-OTP sign-in that issues its own session.
--
--   1. apps/api checks the password, then creates a challenge here (service role only). The code is
--      sent and checked only through that challenge, with send and attempt limits.
--   2. After Supabase accepts the code, apps/api records the new session's session_id on the
--      challenge. Only those sessions count as the Owner.
--   3. app_role() / app_user_id() return NULL for an Owner session that apps/api did not approve: a
--      password-only session, or an email-OTP session made directly against Supabase Auth, gets
--      no data through RLS, the Data API or apps/api.
-- Baristas are unchanged. No existing table changes; this file is additive.

-- ---------------------------------------------------------------------------
-- 1. Challenges and approved Owner sessions. No policies: service role only.
-- ---------------------------------------------------------------------------

create table public.owner_login_challenges (
  challenge_id bigint generated always as identity primary key,
  -- sha256 of the random challenge kept in an HttpOnly cookie by the Admin server.
  token_hash   text not null unique,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes',
  sends        smallint not null default 0,
  last_sent_at timestamptz,
  attempts     smallint not null default 0,
  -- Set once, when the code is accepted: the Auth session this sign-in produced.
  session_id   uuid unique,
  verified_at  timestamptz
);
create index owner_login_challenges_user_idx on public.owner_login_challenges (auth_user_id);

alter table public.owner_login_challenges enable row level security;
revoke all on public.owner_login_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.owner_login_challenges to service_role;

-- Counts one send or one code attempt, atomically, and returns the Owner it belongs to.
-- Raises (and changes nothing) when the challenge is unknown, used, expired or over its limits.
create function public.owner_otp_use(p_token_hash text, p_kind text)
returns table (auth_user_id uuid, email text)
language plpgsql security invoker set search_path = '' as $$
declare
  c public.owner_login_challenges;
begin
  select * into c from public.owner_login_challenges
   where token_hash = p_token_hash for update;
  if not found or c.session_id is not null or c.expires_at <= now() then
    raise exception 'OTP_EXPIRED: sign in again';
  end if;

  if p_kind = 'send' then
    if c.sends >= 3 then
      raise exception 'OTP_LIMIT: too many codes sent, sign in again';
    end if;
    if c.last_sent_at > now() - interval '60 seconds' then
      raise exception 'OTP_RESEND_WAIT: wait a minute before asking for a new code';
    end if;
    update public.owner_login_challenges
       set sends = sends + 1, last_sent_at = now()
     where challenge_id = c.challenge_id;
  elsif p_kind = 'verify' then
    if c.attempts >= 5 then
      raise exception 'OTP_LIMIT: too many wrong codes, sign in again';
    end if;
    update public.owner_login_challenges
       set attempts = attempts + 1
     where challenge_id = c.challenge_id;
  else
    raise exception 'invalid kind %', p_kind;
  end if;

  return query
    select u.auth_user_id, u.email from public.users u
     where u.auth_user_id = c.auth_user_id and u.role = 'owner_admin' and u.status = 'active';
end $$;

revoke execute on function public.owner_otp_use(text, text) from public, anon, authenticated;
grant execute on function public.owner_otp_use(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Owner access needs an approved session. Same signature and security as before, so existing
--    grants and every policy, view and function that calls these keep working.
-- ---------------------------------------------------------------------------

create or replace function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
   where u.auth_user_id = auth.uid() and u.status = 'active'
     and (u.role <> 'owner_admin' or exists (
           select 1 from public.owner_login_challenges c
            where c.auth_user_id = u.auth_user_id
              and c.session_id = (nullif(auth.jwt() ->> 'session_id', ''))::uuid))
$$;

create or replace function public.app_user_id() returns integer
language sql stable security definer set search_path = '' as $$
  select u.user_id from public.users u
   where u.auth_user_id = auth.uid() and u.status = 'active'
     and (u.role <> 'owner_admin' or exists (
           select 1 from public.owner_login_challenges c
            where c.auth_user_id = u.auth_user_id
              and c.session_id = (nullif(auth.jwt() ->> 'session_id', ''))::uuid))
$$;

revoke execute on function public.app_role(), public.app_user_id() from public, anon;
grant execute on function public.app_role(), public.app_user_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Exactly one Owner account, also for writes that bypass provision_initial_owner.
-- ---------------------------------------------------------------------------

create unique index users_single_owner on public.users (role) where role = 'owner_admin';
