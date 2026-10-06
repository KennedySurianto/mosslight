alter table mosslight.profiles add column auth_email text unique;
drop function public.mosslight_register(uuid,text,int,jsonb,jsonb);
create function public.mosslight_register(p_user uuid, p_username text, p_email text, p_seed int, p_profile jsonb, p_world jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_world uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(1734382201);
  if (select count(*) from mosslight.profiles) >= 250 then raise exception 'Registration is currently full'; end if;
  insert into mosslight.profiles(user_id, username, auth_email, state)
    values (p_user, p_username, p_email, p_profile);
  insert into mosslight.worlds(owner_id, seed, state) values (p_user, p_seed, p_world) returning id into v_world;
  return v_world;
end $$;
revoke all on function public.mosslight_register(uuid,text,text,int,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.mosslight_register(uuid,text,text,int,jsonb,jsonb) to service_role;

create function public.mosslight_auth_email(p_username text)
returns text language sql security invoker set search_path = '' as $$
  select auth_email from mosslight.profiles where username=lower(p_username);
$$;
revoke all on function public.mosslight_auth_email(text) from public, anon, authenticated;
grant execute on function public.mosslight_auth_email(text) to service_role;

create or replace function public.mosslight_state(p_user uuid, p_world uuid default null)
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
    'profile', to_jsonb(v_profile) - 'auth_email', 'world', to_jsonb(v_world),
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
