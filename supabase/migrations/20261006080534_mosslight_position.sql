create or replace function public.mosslight_join(p_user uuid, p_world uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_state jsonb; v_count int;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_world::text));
  v_state := public.mosslight_state(p_user,p_world);
  delete from mosslight.world_sessions where user_id=p_user and world_id<>p_world;
  select count(*) into v_count from mosslight.world_sessions where world_id=p_world and expires_at>now() and user_id<>p_user;
  if v_count >= 3 then raise exception 'This world is full'; end if;
  insert into mosslight.world_sessions(world_id,user_id,topic,state,expires_at)
    values (p_world,p_user,'mosslight:' || p_world::text,
      jsonb_build_object('x',624,'y',736,'facing',1,'damageKey','','damageHits',0,
        'lastAction',0,'lastPositionAt',floor(extract(epoch from clock_timestamp())*1000)),
      now()+interval '15 minutes')
    on conflict(world_id,user_id) do update set expires_at=excluded.expires_at;
  return public.mosslight_state(p_user,p_world);
end $$;

create function public.mosslight_position(p_user uuid, p_world uuid, p_state jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if octet_length(p_state::text)>1024 then return false; end if;
  update mosslight.world_sessions set state=p_state, expires_at=now()+interval '15 minutes'
    where world_id=p_world and user_id=p_user and expires_at>now();
  return found;
end $$;
revoke all on function public.mosslight_position(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.mosslight_position(uuid,uuid,jsonb) to service_role;
