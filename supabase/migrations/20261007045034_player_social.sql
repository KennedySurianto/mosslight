-- One world per player remains enforced by worlds.owner_id UNIQUE.
-- All new RPCs are service-role only; existing tracker tables are untouched.
create or replace function public.mosslight_join(p_user uuid, p_world uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_state jsonb; v_count int;
begin
  -- Serialize concurrent joins by the same account, then room capacity checks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user::text));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_world::text));
  v_state := public.mosslight_state(p_user,p_world);
  delete from mosslight.world_sessions where (user_id=p_user and world_id<>p_world)
    or (world_id=p_world and (expires_at<=now() or coalesce((state->>'lastPositionAt')::double precision,0)<extract(epoch from now()-interval '45 seconds')*1000));
  select count(*) into v_count from mosslight.world_sessions where world_id=p_world and user_id<>p_user;
  if v_count>=3 then raise exception 'This world is full'; end if;
  insert into mosslight.world_sessions(world_id,user_id,topic,state,expires_at)
    values(p_world,p_user,'mosslight:'||p_world::text,jsonb_build_object('x',624,'y',736,'facing',1,'damageKey','','damageHits',0,'lastAction',0,'lastPositionAt',floor(extract(epoch from clock_timestamp())*1000)),now()+interval '15 minutes')
    on conflict(world_id,user_id) do update set expires_at=excluded.expires_at,
      state=mosslight.world_sessions.state||jsonb_build_object('lastPositionAt',excluded.state->'lastPositionAt');
  return public.mosslight_state(p_user,p_world);
end $$;
create function public.mosslight_players(p_user uuid, p_query text default '', p_after text default '')
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.username), '[]'::jsonb) from (
    select p.user_id as "userId", p.username, coalesce(f.status,'none') as status,
      coalesce(f.requested_by<>p_user,false) as incoming,
      case when f.status='accepted' then jsonb_build_object('id',w.id,'name',w.name) end as world
    from mosslight.profiles p
    left join mosslight.friendships f on f.user_low=least(p_user,p.user_id) and f.user_high=greatest(p_user,p.user_id)
    left join mosslight.worlds w on w.owner_id=p.user_id
    where exists(select 1 from mosslight.profiles where user_id=p_user)
      and p.user_id<>p_user and p.username>p_after
      and (case when p_query='' then f.status is not null else left(p.username,length(p_query))=p_query end)
    order by p.username limit 21
  ) r;
$$;

create function public.mosslight_locations(p_user uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'location',
    case when w.id is not null then jsonb_build_object('worldId',w.id,'name',w.name,'own',w.owner_id=p.user_id,'owner',o.username) end)), '[]'::jsonb)
  from mosslight.friendships f
  join mosslight.profiles p on p.user_id=case when f.user_low=p_user then f.user_high else f.user_low end
  left join mosslight.world_sessions s on s.user_id=p.user_id and s.expires_at>now()
    and coalesce((s.state->>'lastPositionAt')::double precision,0)>extract(epoch from now()-interval '45 seconds')*1000
  left join mosslight.worlds w on w.id=s.world_id
  left join mosslight.profiles o on o.user_id=w.owner_id
  where f.status='accepted' and p_user in (f.user_low,f.user_high);
$$;

create function public.mosslight_room_players(p_user uuid,p_world uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform public.mosslight_state(p_user,p_world);
  if not exists(select 1 from mosslight.world_sessions where user_id=p_user and world_id=p_world and expires_at>now()) then
    raise exception 'Join this world first';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'username',p.username,
    'x',s.state->'x','y',s.state->'y','facing',s.state->'facing')), '[]'::jsonb)
    from mosslight.world_sessions s join mosslight.profiles p on p.user_id=s.user_id
    where s.world_id=p_world and s.expires_at>now()
      and coalesce((s.state->>'lastPositionAt')::double precision,0)>extract(epoch from now()-interval '45 seconds')*1000);
end $$;

create function public.mosslight_rename(p_user uuid,p_world uuid,p_name text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if char_length(p_name) not between 1 and 32 or p_name ~ '[[:cntrl:]]' then raise exception 'Use 1–32 printable characters'; end if;
  update mosslight.worlds set name=p_name where id=p_world and owner_id=p_user;
  if not found then raise exception 'Only the owner can rename this world'; end if;
  perform realtime.send(jsonb_build_object('kind','rename','name',p_name),'world','mosslight:'||p_world::text,true);
  return p_name;
end $$;

-- Notify the old room even when its former member no longer has room access.
create function mosslight.notify_departure() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind','departure','userId',old.user_id),'world',old.topic,true);
  return old;
end $$;
create trigger mosslight_departure after delete on mosslight.world_sessions for each row execute function mosslight.notify_departure();
revoke all on function mosslight.notify_departure() from public,anon,authenticated;

revoke all on function public.mosslight_players(uuid,text,text) from public,anon,authenticated;
revoke all on function public.mosslight_locations(uuid) from public,anon,authenticated;
revoke all on function public.mosslight_room_players(uuid,uuid) from public,anon,authenticated;
revoke all on function public.mosslight_rename(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mosslight_players(uuid,text,text), public.mosslight_locations(uuid), public.mosslight_room_players(uuid,uuid), public.mosslight_rename(uuid,uuid,text) to service_role;
