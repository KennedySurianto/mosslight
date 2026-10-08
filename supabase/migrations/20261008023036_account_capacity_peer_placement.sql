-- Only the Edge Functions can inspect capacity and manage account aliases.
create function public.mosslight_capacity_full()
returns boolean language sql stable security invoker set search_path = '' as $$
  select pg_catalog.current_setting('transaction_read_only') = 'on'
    and pg_catalog.pg_database_size(pg_catalog.current_database()) >= 500 * 1024 * 1024;
$$;
revoke all on function public.mosslight_capacity_full() from public, anon, authenticated;
grant execute on function public.mosslight_capacity_full() to service_role;

create function public.mosslight_account_email(p_user uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select auth_email from mosslight.profiles where user_id = p_user;
$$;
revoke all on function public.mosslight_account_email(uuid) from public, anon, authenticated;
grant execute on function public.mosslight_account_email(uuid) to service_role;

create function public.mosslight_change_username(p_user uuid, p_username text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_username text;
begin
  if p_username !~ '^[a-z0-9_]{3,20}$' then raise exception 'Use 3–20 letters, numbers or underscores'; end if;
  update mosslight.profiles set username = p_username where user_id = p_user
    returning username into v_username;
  if not found then raise exception 'Profile not found'; end if;
  perform realtime.send(pg_catalog.jsonb_build_object('kind','identity','userId',p_user,'username',v_username),
    'world', s.topic, true)
    from mosslight.world_sessions s where s.user_id = p_user and s.expires_at > now();
  return v_username;
exception when unique_violation then
  raise exception 'Username already taken';
end $$;
revoke all on function public.mosslight_change_username(uuid,text) from public, anon, authenticated;
grant execute on function public.mosslight_change_username(uuid,text) to service_role;

-- Serialize player movement with placement. The room has at most four players.
create or replace function public.mosslight_position(p_user uuid, p_world uuid, p_state jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_revision bigint;
begin
  if pg_catalog.octet_length(p_state::text) > 1024 then return false; end if;
  select revision into v_revision from mosslight.worlds where id = p_world for update;
  if v_revision is null or (p_state ? 'worldRevision' and v_revision <> (p_state->>'worldRevision')::bigint) then return false; end if;
  update mosslight.world_sessions set
    state = state || pg_catalog.jsonb_build_object(
      'x',p_state->'x','y',p_state->'y','facing',p_state->'facing',
      'lastPositionAt',p_state->'lastPositionAt'),
    expires_at = now() + interval '15 minutes'
    where world_id = p_world and user_id = p_user and expires_at > now();
  if not found then return false; end if;
  perform realtime.send(pg_catalog.jsonb_build_object(
    'userId',p_user,'x',p_state->'x','y',p_state->'y','facing',p_state->'facing'),
    'move','mosslight:' || p_world::text,true);
  return true;
end $$;

create or replace function public.mosslight_commit(
  p_user uuid, p_world uuid, p_world_revision bigint, p_profile_revision bigint,
  p_world_state jsonb, p_profile_state jsonb, p_session_state jsonb, p_event jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_world mosslight.worlds%rowtype;
  v_profile mosslight.profiles%rowtype;
  v_session mosslight.world_sessions%rowtype;
  v_x int;
  v_y int;
begin
  select * into v_profile from mosslight.profiles where user_id = p_user for update;
  select * into v_world from mosslight.worlds where id = p_world for update;
  select * into v_session from mosslight.world_sessions where world_id = p_world and user_id = p_user for update;
  if v_profile.user_id is null or v_world.id is null or v_session.user_id is null or v_session.expires_at <= now()
    then raise exception 'Session expired'; end if;
  if v_profile.revision <> p_profile_revision or v_world.revision <> p_world_revision then raise exception 'State changed; retry'; end if;
  if p_world_state is not null and not (v_world.owner_id = p_user or exists (
    select 1 from mosslight.world_builders where world_id = p_world and user_id = p_user
  )) then raise exception 'Build access denied'; end if;
  if p_event->>'kind' = 'plant' or (p_event->>'kind' = 'tile' and (p_event->>'id')::int > 0) then
    v_x := case when p_event->>'kind' = 'plant' then (p_event->'tree'->>'x')::int else (p_event->>'x')::int end;
    v_y := case when p_event->>'kind' = 'plant' then (p_event->'tree'->>'y')::int else (p_event->>'y')::int end;
    if exists (
      select 1 from mosslight.world_sessions s
      where s.world_id = p_world and s.user_id <> p_user and s.expires_at > now()
        and (s.state->>'lastPositionAt')::double precision > extract(epoch from now() - interval '45 seconds') * 1000
        and (s.state->>'x')::double precision + 10 > v_x * 32
        and (s.state->>'x')::double precision - 10 < (v_x + 1) * 32
        and (s.state->>'y')::double precision > v_y * 32
        and (s.state->>'y')::double precision - 30 < (v_y + 1) * 32
    ) then raise exception 'A player is standing there'; end if;
  end if;
  if p_world_state is not null then
    update mosslight.worlds set state = p_world_state, revision = revision + 1 where id = p_world;
  end if;
  if p_profile_state is not null then
    update mosslight.profiles set state = p_profile_state, revision = revision + 1 where user_id = p_user;
  end if;
  if p_session_state is not null then
    update mosslight.world_sessions set state = p_session_state, expires_at = now() + interval '15 minutes'
      where world_id = p_world and user_id = p_user;
  end if;
  if p_event is not null then
    perform realtime.send(p_event, 'world', 'mosslight:' || p_world::text, true);
  end if;
  return public.mosslight_state(p_user,p_world);
end $$;
