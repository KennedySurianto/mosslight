drop policy mosslight_room_send on realtime.messages;
create policy mosslight_room_send on realtime.messages for insert to authenticated
  with check (public.mosslight_room_member() and extension = 'presence' and
    octet_length(payload::text) <= 512);

-- Relay verified positions from the server. Clients cannot impersonate other
-- players by forging a broadcast payload.
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
  if not found then return false; end if;
  perform realtime.send(jsonb_build_object(
    'userId',p_user,'x',p_state->'x','y',p_state->'y','facing',p_state->'facing'),
    'move','mosslight:' || p_world::text,true);
  return true;
end $$;
