-- ─────────────────────────────────────────────────────────────────────────
-- Owner-dashboard scaffold — schema, RLS, analytics.
-- No service-role key: admin writes go through RLS via is_admin().
-- ─────────────────────────────────────────────────────────────────────────

-- Admin allowlist. Add a row to grant someone the owner dashboard.
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users
  for select using (user_id = auth.uid());

-- The role check every policy + rollup reuses.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from admin_users where user_id = auth.uid()); $$;
grant execute on function public.is_admin() to anon, authenticated;

-- ── Example resource: items (rename to your domain noun) ──────────────────
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  description text,
  price_cents integer not null default 0,
  status      text not null default 'draft' check (status in ('draft','active','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.items enable row level security;
-- Public sees only active items; the owner (is_admin) reads/writes everything.
drop policy if exists items_public_read on public.items;
create policy items_public_read on public.items for select using (status = 'active');
drop policy if exists items_admin_all on public.items;
create policy items_admin_all on public.items for all using (is_admin()) with check (is_admin());

-- ── Analytics: live visitors + website clicks ─────────────────────────────
create table if not exists public.site_visits (
  id         bigint generated always as identity primary key,
  session_id text not null,
  path       text,                 -- NULL = heartbeat ping (not a pageview)
  created_at timestamptz not null default now()
);
create index if not exists site_visits_created_idx on public.site_visits (created_at);
create index if not exists site_visits_pageview_idx on public.site_visits (created_at) where path is not null;
alter table public.site_visits enable row level security;
drop policy if exists site_visits_admin_read on public.site_visits;
create policy site_visits_admin_read on public.site_visits for select using (is_admin());

-- Public writer: one pageview (p_path set) or heartbeat (p_path null).
create or replace function public.record_site_visit(p_session text, p_path text default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_session is null or length(p_session) < 8 or length(p_session) > 64 then return; end if;
  insert into site_visits (session_id, path) values (p_session, left(nullif(p_path,''), 200));
  if random() < 0.02 then
    delete from site_visits where path is null and created_at < now() - interval '1 day';
  end if;
end; $$;
revoke all on function public.record_site_visit(text, text) from public;
grant execute on function public.record_site_visit(text, text) to anon, authenticated;

-- Admin-only rollup. "Today" uses the shop's local calendar day (edit the tz).
create or replace function public.site_traffic_stats()
returns json language plpgsql security definer set search_path = public stable
as $$
declare day_start timestamptz;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  day_start := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
  return (select json_build_object(
    'live',           (select count(distinct session_id) from site_visits where created_at > now() - interval '5 minutes'),
    'visitors_today', (select count(distinct session_id) from site_visits where created_at >= day_start),
    'views_today',    (select count(*)                   from site_visits where path is not null and created_at >= day_start),
    'visitors_30d',   (select count(distinct session_id) from site_visits where created_at > now() - interval '30 days'),
    'views_30d',      (select count(*)                   from site_visits where path is not null and created_at > now() - interval '30 days')
  ));
end; $$;
revoke all on function public.site_traffic_stats() from public, anon;
grant execute on function public.site_traffic_stats() to authenticated;
