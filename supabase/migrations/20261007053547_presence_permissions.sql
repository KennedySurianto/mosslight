-- Realtime uses a NULL payload for its presence authorization probe.
-- Clients still cannot broadcast gameplay or chat; those are server-only.
drop policy mosslight_room_send on realtime.messages;
create policy mosslight_room_send on realtime.messages for insert to authenticated
  with check (mosslight.room_member() and extension = 'presence' and
    coalesce(octet_length(payload::text),0) <= 512);
