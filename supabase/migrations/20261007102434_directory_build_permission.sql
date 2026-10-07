-- Include only the requesting owner's grant to each accepted friend.
create or replace function public.mosslight_players(p_user uuid, p_query text default '', p_after text default '')
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.username), '[]'::jsonb) from (
    select p.user_id as "userId", p.username, coalesce(f.status,'none') as status,
      coalesce(f.requested_by<>p_user,false) as incoming,
      (coalesce(f.status='accepted',false) and exists (
        select 1 from mosslight.world_builders b
        join mosslight.worlds mine on mine.id=b.world_id
        where mine.owner_id=p_user and b.user_id=p.user_id
      )) as "canBuild",
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
