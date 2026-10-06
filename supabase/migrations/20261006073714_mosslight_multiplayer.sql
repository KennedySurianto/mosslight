-- Mosslight owns only this schema. Existing Investment Tracker tables are untouched.
create schema if not exists mosslight;
revoke all on schema mosslight from public, anon, authenticated;
grant usage on schema mosslight to service_role, authenticated;

create table mosslight.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 8192),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now()
);
create table mosslight.worlds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references mosslight.profiles(user_id) on delete cascade,
  name text not null default 'The First Meadow' check (char_length(name) between 1 and 32),
  seed integer not null check (seed between 0 and 2147483647),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 131072),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now()
);
create table mosslight.friendships (
  user_low uuid not null references mosslight.profiles(user_id) on delete cascade,
  user_high uuid not null references mosslight.profiles(user_id) on delete cascade,
  requested_by uuid not null references mosslight.profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);
create index friendships_high_idx on mosslight.friendships(user_high, status);
create table mosslight.world_builders (
  world_id uuid not null references mosslight.worlds(id) on delete cascade,
  user_id uuid not null references mosslight.profiles(user_id) on delete cascade,
  primary key (world_id, user_id)
);
create index world_builders_user_idx on mosslight.world_builders(user_id);
create table mosslight.world_sessions (
  world_id uuid not null references mosslight.worlds(id) on delete cascade,
  user_id uuid not null references mosslight.profiles(user_id) on delete cascade,
  topic text not null check (char_length(topic) <= 64),
  state jsonb not null default '{"x":624,"y":736,"damageKey":"","damageHits":0,"lastAction":0}'::jsonb
    check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 1024),
  expires_at timestamptz not null,
  primary key (world_id, user_id)
);
create index world_sessions_user_idx on mosslight.world_sessions(user_id, expires_at);
create table mosslight.rate_limits (
  key text primary key check (char_length(key) <= 80),
  window_start timestamptz not null,
  count integer not null check (count >= 0)
);

alter table mosslight.profiles enable row level security;
alter table mosslight.worlds enable row level security;
alter table mosslight.friendships enable row level security;
alter table mosslight.world_builders enable row level security;
alter table mosslight.world_sessions enable row level security;
alter table mosslight.rate_limits enable row level security;
revoke all on all tables in schema mosslight from public, anon, authenticated;
grant all on all tables in schema mosslight to service_role;
grant select on mosslight.world_sessions to authenticated;
create policy mosslight_own_session on mosslight.world_sessions for select to authenticated
  using (user_id = (select auth.uid()) and expires_at > now());

-- A user may join only the room the server admitted them to. Clients can send
-- movement and presence, but only the server can send persistent world events.
create policy mosslight_room_read on realtime.messages for select to authenticated
  using (private = true and topic like 'mosslight:%' and exists (
    select 1 from mosslight.world_sessions s
    where s.user_id = (select auth.uid()) and s.topic = (select realtime.topic()) and s.expires_at > now()
  ));
create policy mosslight_room_send on realtime.messages for insert to authenticated
  with check (private = true and topic like 'mosslight:%' and
    (extension = 'presence' or (extension = 'broadcast' and event = 'move')) and
    octet_length(payload::text) <= 512 and exists (
      select 1 from mosslight.world_sessions s
      where s.user_id = (select auth.uid()) and s.topic = (select realtime.topic()) and s.expires_at > now()
    ));

-- These RPCs are server-only. They live in public solely because the project's
-- existing Data API already exposes public; game tables stay in mosslight.
create function public.mosslight_take_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count int;
begin
  if char_length(p_key) > 80 or p_max < 1 or p_window_seconds < 1 then return false; end if;
  insert into mosslight.rate_limits(key, window_start, count) values (p_key, now(), 1)
    on conflict (key) do update set
      window_start = case when mosslight.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
        then now() else mosslight.rate_limits.window_start end,
      count = case when mosslight.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
        then 1 else mosslight.rate_limits.count + 1 end
    returning count into v_count;
  return v_count <= p_max;
end $$;

create function public.mosslight_register(p_user uuid, p_username text, p_seed int, p_profile jsonb, p_world jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_world uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(1734382201);
  if (select count(*) from mosslight.profiles) >= 250 then raise exception 'Registration is currently full'; end if;
  insert into mosslight.profiles(user_id, username, state) values (p_user, p_username, p_profile);
  insert into mosslight.worlds(owner_id, seed, state) values (p_user, p_seed, p_world) returning id into v_world;
  return v_world;
end $$;

create function public.mosslight_state(p_user uuid, p_world uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_world mosslight.worlds%rowtype; v_profile mosslight.profiles%rowtype; v_allowed boolean;
begin
  select * into v_profile from mosslight.profiles where user_id = p_user;
  if not found then raise exception 'Profile not found'; end if;
  if p_world is null then select * into v_world from mosslight.worlds where owner_id = p_user;
  else select * into v_world from mosslight.worlds where id = p_world; end if;
  if not found then raise exception 'World not found'; end if;
  v_allowed := v_world.owner_id = p_user or exists (
    select 1 from mosslight.friendships f where f.status = 'accepted'
      and f.user_low = least(p_user,v_world.owner_id) and f.user_high = greatest(p_user,v_world.owner_id)
  );
  if not v_allowed then raise exception 'World access denied'; end if;
  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_profile), 'world', to_jsonb(v_world),
    'canBuild', v_world.owner_id = p_user or exists (
      select 1 from mosslight.world_builders b where b.world_id = v_world.id and b.user_id = p_user
    ),
    'session', (select to_jsonb(s) from mosslight.world_sessions s where s.world_id = v_world.id and s.user_id = p_user),
    'worlds', (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'owner',p.username,'ownerId',w.owner_id)), '[]'::jsonb)
      from mosslight.worlds w join mosslight.profiles p on p.user_id=w.owner_id
      where w.owner_id=p_user or exists (select 1 from mosslight.friendships f where f.status='accepted'
        and f.user_low=least(p_user,w.owner_id) and f.user_high=greatest(p_user,w.owner_id))),
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('username',p.username,'userId',p.user_id,
      'status',f.status,'incoming',f.requested_by<>p_user)), '[]'::jsonb)
      from mosslight.friendships f join mosslight.profiles p
        on p.user_id=case when f.user_low=p_user then f.user_high else f.user_low end
      where f.user_low=p_user or f.user_high=p_user)
  );
end $$;

create function public.mosslight_join(p_user uuid, p_world uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_state jsonb; v_owner uuid; v_count int;
begin
  v_state := public.mosslight_state(p_user,p_world);
  v_owner := (v_state->'world'->>'owner_id')::uuid;
  delete from mosslight.world_sessions where user_id=p_user and world_id<>p_world;
  select count(*) into v_count from mosslight.world_sessions where world_id=p_world and expires_at>now() and user_id<>p_user;
  if v_count >= 3 then raise exception 'This world is full'; end if;
  insert into mosslight.world_sessions(world_id,user_id,topic,expires_at)
    values (p_world,p_user,'mosslight:' || p_world::text,now()+interval '15 minutes')
    on conflict(world_id,user_id) do update set expires_at=excluded.expires_at;
  return public.mosslight_state(p_user,p_world);
end $$;

create function public.mosslight_leave(p_user uuid, p_world uuid)
returns void language sql security invoker set search_path = '' as $$
  delete from mosslight.world_sessions where user_id=p_user and world_id=p_world;
$$;

create function public.mosslight_social(p_user uuid, p_action text, p_target text, p_world uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_target uuid; v_low uuid; v_high uuid; v_friend mosslight.friendships%rowtype; v_owner uuid;
begin
  select user_id into v_target from mosslight.profiles where username=lower(p_target);
  if v_target is null or v_target=p_user then raise exception 'Player not found'; end if;
  v_low := least(p_user,v_target); v_high := greatest(p_user,v_target);
  select * into v_friend from mosslight.friendships where user_low=v_low and user_high=v_high;
  if p_action='request' then
    if found then raise exception 'Request already exists'; end if;
    if (select count(*) from mosslight.friendships where user_low=p_user or user_high=p_user)>=50 then raise exception 'Friend limit reached'; end if;
    insert into mosslight.friendships(user_low,user_high,requested_by) values(v_low,v_high,p_user);
  elsif p_action='accept' then
    if not found or v_friend.requested_by=p_user then raise exception 'No incoming request'; end if;
    update mosslight.friendships set status='accepted' where user_low=v_low and user_high=v_high;
  elsif p_action='remove' then
    delete from mosslight.friendships where user_low=v_low and user_high=v_high;
    delete from mosslight.world_builders where user_id in (p_user,v_target)
      and world_id in (select id from mosslight.worlds where owner_id in (p_user,v_target));
    delete from mosslight.world_sessions where user_id in (p_user,v_target)
      and world_id in (select id from mosslight.worlds where owner_id in (p_user,v_target));
  elsif p_action='builder' or p_action='viewer' then
    select owner_id into v_owner from mosslight.worlds where id=p_world;
    if v_owner<>p_user or v_friend.status<>'accepted' then raise exception 'Only the owner can grant a friend build access'; end if;
    if p_action='builder' then insert into mosslight.world_builders(world_id,user_id) values(p_world,v_target)
      on conflict do nothing;
    else delete from mosslight.world_builders where world_id=p_world and user_id=v_target; end if;
  else raise exception 'Unknown social action'; end if;
  return public.mosslight_state(p_user,null);
end $$;

create function public.mosslight_commit(
  p_user uuid, p_world uuid, p_world_revision bigint, p_profile_revision bigint,
  p_world_state jsonb, p_profile_state jsonb, p_session_state jsonb, p_event jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_world mosslight.worlds%rowtype; v_profile mosslight.profiles%rowtype; v_session mosslight.world_sessions%rowtype;
begin
  select * into v_profile from mosslight.profiles where user_id=p_user for update;
  select * into v_world from mosslight.worlds where id=p_world for update;
  select * into v_session from mosslight.world_sessions where world_id=p_world and user_id=p_user for update;
  if v_profile.user_id is null or v_world.id is null or v_session.user_id is null or v_session.expires_at<=now()
    then raise exception 'Session expired'; end if;
  if v_profile.revision<>p_profile_revision or v_world.revision<>p_world_revision then raise exception 'State changed; retry'; end if;
  if p_world_state is not null and not (v_world.owner_id=p_user or exists (
    select 1 from mosslight.world_builders where world_id=p_world and user_id=p_user
  )) then raise exception 'Build access denied'; end if;
  if p_world_state is not null then
    update mosslight.worlds set state=p_world_state, revision=revision+1 where id=p_world;
  end if;
  if p_profile_state is not null then
    update mosslight.profiles set state=p_profile_state, revision=revision+1 where user_id=p_user;
  end if;
  if p_session_state is not null then
    update mosslight.world_sessions set state=p_session_state, expires_at=now()+interval '15 minutes'
      where world_id=p_world and user_id=p_user;
  end if;
  if p_event is not null then
    perform realtime.send(p_event, 'world', 'mosslight:' || p_world::text, true);
  end if;
  return public.mosslight_state(p_user,p_world);
end $$;

-- Lock the server RPC surface to service_role. Browser tokens cannot invoke it.
revoke all on function public.mosslight_take_limit(text,int,int) from public, anon, authenticated;
revoke all on function public.mosslight_register(uuid,text,int,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.mosslight_state(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mosslight_join(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mosslight_leave(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mosslight_social(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.mosslight_commit(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.mosslight_take_limit(text,int,int) to service_role;
grant execute on function public.mosslight_register(uuid,text,int,jsonb,jsonb) to service_role;
grant execute on function public.mosslight_state(uuid,uuid) to service_role;
grant execute on function public.mosslight_join(uuid,uuid) to service_role;
grant execute on function public.mosslight_leave(uuid,uuid) to service_role;
grant execute on function public.mosslight_social(uuid,text,text,uuid) to service_role;
grant execute on function public.mosslight_commit(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,jsonb) to service_role;
