-- Gunita Kopi POS: shared sign-in throttle (additive).
-- POST /api/auth/login runs on many serverless instances, so counters live in Postgres.
-- The API builds SHA-256 keys (never raw usernames or IPs):
--   pair:<hash(username|ip)>     failures of one username from one IP   (locks that pair)
--   ip:<hash(ip)>                failures from one IP, any username     (locks that IP)
--   acct:<hash(username)>        failures for one username, any IP      (locks it only for untrusted IPs)
--   trusted:<hash(username|ip)>  IP with a successful sign-in for that username in the last 30 days
-- So an attacker elsewhere cannot lock staff out of a terminal they already use.
-- Only the API (service role) touches this table; staff and anonymous users have no access.

create table public.login_throttle (
  key          text primary key,
  failures     integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  lockouts     integer not null default 0,
  updated_at   timestamptz not null default now()
);

create index login_throttle_updated_at_idx on public.login_throttle (updated_at);

alter table public.login_throttle enable row level security;
-- No policies: RLS denies every row to anon and authenticated even if a grant slips in.

revoke all on public.login_throttle from public, anon, authenticated;
grant select, insert, update, delete on public.login_throttle to service_role;

-- True while the pair or the IP is locked, or the account is locked and this IP is not trusted.
create function public.login_throttle_blocked(
  p_pair_key    text,
  p_ip_key      text,
  p_account_key text,
  p_trusted_key text
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
      from public.login_throttle t
     where t.locked_until > now()
       and (t.key in (p_pair_key, p_ip_key)
            or (t.key = p_account_key
                and not exists (select 1 from public.login_throttle tr
                                 where tr.key = p_trusted_key
                                   and tr.updated_at > now() - interval '30 days')))
  );
$$;

-- Count one failed sign-in for each key. A key that reaches its limit inside the window is
-- locked; each further lockout doubles the lock time up to p_max_lock_seconds (progressive).
-- Returns the latest active lock among the keys, or NULL.
create function public.login_throttle_fail(
  p_keys             text[],
  p_limits           integer[],
  p_window_seconds   integer,
  p_lock_seconds     integer,
  p_max_lock_seconds integer
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
begin
  -- Bounded housekeeping: remove up to 100 idle rows (1 day; trusted rows 30 days) that hold
  -- no active lock. SKIP LOCKED never waits on rows other sign-ins are using.
  delete from public.login_throttle
   where key in (select key from public.login_throttle
                  where updated_at < now() - interval '1 day'
                    and (key not like 'trusted:%' or updated_at < now() - interval '30 days')
                    and (locked_until is null or locked_until < now())
                  order by updated_at
                  limit 100
                  for update skip locked);

  insert into public.login_throttle as t (key, failures, window_start, updated_at)
  select k, 1, now(), now() from unnest(p_keys) as k
  on conflict (key) do update set
    failures     = case when t.window_start < now() - v_window then 1 else t.failures + 1 end,
    window_start = case when t.window_start < now() - v_window then now() else t.window_start end,
    updated_at   = now();

  update public.login_throttle t
     set locked_until = now() + make_interval(secs => least(
                          p_max_lock_seconds::double precision,
                          p_lock_seconds * power(2, least(t.lockouts, 16)))),
         lockouts     = t.lockouts + 1,
         failures     = 0,
         window_start = now()
    from unnest(p_keys, p_limits) as l(k, lim)
   where t.key = l.k and t.failures >= l.lim;

  return (select max(locked_until) from public.login_throttle
           where key = any(p_keys) and locked_until > now());
end;
$$;

-- Correct password: clear this pair's counter and remember the IP as trusted for the username.
-- The account counter is kept, so a distributed attack stays blocked for untrusted IPs.
create function public.login_throttle_success(
  p_pair_key    text,
  p_trusted_key text
) returns void
language sql security invoker set search_path = '' as $$
  delete from public.login_throttle where key = p_pair_key;
  insert into public.login_throttle (key, updated_at) values (p_trusted_key, now())
  on conflict (key) do update set updated_at = now();
$$;

revoke execute on function public.login_throttle_blocked(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.login_throttle_fail(text[], integer[], integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.login_throttle_success(text, text) from public, anon, authenticated;
grant execute on function public.login_throttle_blocked(text, text, text, text) to service_role;
grant execute on function public.login_throttle_fail(text[], integer[], integer, integer, integer) to service_role;
grant execute on function public.login_throttle_success(text, text) to service_role;
