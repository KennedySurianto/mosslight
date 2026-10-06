create function mosslight.room_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (select realtime.topic()) like 'mosslight:%'
    and exists (select 1 from mosslight.world_sessions s
      where s.user_id = (select auth.uid()) and s.topic = (select realtime.topic()) and s.expires_at > now());
$$;
revoke all on function mosslight.room_member() from public, anon;
grant execute on function mosslight.room_member() to authenticated;

drop policy mosslight_room_read on realtime.messages;
create policy mosslight_room_read on realtime.messages for select to authenticated
  using (mosslight.room_member());
drop policy mosslight_room_send on realtime.messages;
create policy mosslight_room_send on realtime.messages for insert to authenticated
  with check (mosslight.room_member() and extension = 'presence' and
    octet_length(payload::text) <= 512);
drop function public.mosslight_room_member();

create index friendships_requester_idx on mosslight.friendships(requested_by);
