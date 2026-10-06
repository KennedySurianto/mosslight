-- Keep the rate-limit ledger small on the free tier.
create or replace function public.mosslight_take_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count int;
begin
  if char_length(p_key) > 80 or p_max < 1 or p_window_seconds < 1 then return false; end if;
  if random() < 0.02 then
    delete from mosslight.rate_limits where key in (
      select key from mosslight.rate_limits
      where window_start < now() - interval '1 day' limit 200
    );
  end if;
  insert into mosslight.rate_limits(key, window_start, count) values (p_key, now(), 1)
    on conflict (key) do update set
      window_start = case when mosslight.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
        then now() else mosslight.rate_limits.window_start end,
      count = case when mosslight.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
        then 1 else mosslight.rate_limits.count + 1 end
    returning count into v_count;
  return v_count <= p_max;
end $$;

-- Position updates must never overwrite mining cooldowns or damage progress.
create or replace function public.mosslight_position(p_user uuid, p_world uuid, p_state jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if octet_length(p_state::text)>1024 then return false; end if;
  update mosslight.world_sessions set
    state = state || jsonb_build_object(
      'x',p_state->'x','y',p_state->'y','facing',p_state->'facing',
      'lastPositionAt',p_state->'lastPositionAt'),
    expires_at=now()+interval '15 minutes'
    where world_id=p_world and user_id=p_user and expires_at>now();
  return found;
end $$;
