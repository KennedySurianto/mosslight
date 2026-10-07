import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { chatText, chatDuration, worldName } from "../_shared/social.ts";
import { applyAction, applyShop, moveSession, type ProfileState, type SessionState, type WorldState } from "../_shared/mosslight.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
function required<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
type Snapshot = {
  profile: { user_id: string; username: string; state: ProfileState; revision: number };
  world: { id: string; owner_id: string; name: string; seed: number; state: WorldState; revision: number };
  session: { state: SessionState; expires_at: string } | null;
  canBuild: boolean;
  worlds: { id: string; name: string; owner: string; ownerId: string }[];
  friends: { username: string; userId: string; status: string; incoming: boolean }[];
};
const state = async (userId: string, worldId?: string): Promise<Snapshot> =>
  required(await admin.rpc("mosslight_state", { p_user: userId, p_world: worldId ?? null })) as Snapshot;
async function commit(userId: string, snapshot: Snapshot, world: WorldState | null, profile: ProfileState | null, session: SessionState | null, event: Record<string, unknown> | null) {
  return required(await admin.rpc("mosslight_commit", {
    p_user: userId, p_world: snapshot.world.id,
    p_world_revision: snapshot.world.revision, p_profile_revision: snapshot.profile.revision,
    p_world_state: world, p_profile_state: profile, p_session_state: session, p_event: event,
  })) as Snapshot;
}
async function limited(key: string, max: number, seconds: number) {
  return required(await admin.rpc("mosslight_take_limit", { p_key: key, p_max: max, p_window_seconds: seconds })) === true;
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sign in first" }, 401);
    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await auth.auth.getUser(token);
    if (authError || !userData.user) return reply({ error: "Session expired" }, 401);
    const userId = userData.user.id;
    if (Number(request.headers.get("content-length")) > 4096) return reply({ error: "Request too large" }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "Request too large" }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const type = body.type;
    if (!(await limited(`game:${userId}`, 240, 60))) return reply({ error: "Too many actions; slow down" }, 429);
    const worldId = typeof body.worldId === "string" && /^[0-9a-f-]{36}$/.test(body.worldId) ? body.worldId : undefined;
    if (type === "state") return reply({ data: await state(userId, worldId) });
    if (type === "players") {
      const query = typeof body.query === 'string' ? body.query.trim().toLowerCase() : '';
      const after = typeof body.after === 'string' ? body.after : '';
      if (!/^[a-z0-9_]{0,20}$/.test(query) || !/^[a-z0-9_]{0,20}$/.test(after)) throw new Error('Use letters, numbers or underscores');
      if (!(await limited(`search:${userId}`, 60, 60))) return reply({ error: 'Please wait before searching again' }, 429);
      const rows = required(await admin.rpc('mosslight_players', { p_user: userId, p_query: query, p_after: after })) as { username: string }[];
      return reply({ players: rows.slice(0,20), next: rows.length>20 ? rows[19].username : null });
    }
    if (type === 'locations') return reply({ locations: required(await admin.rpc('mosslight_locations', { p_user: userId })) });
    if (type === 'roster') {
      if (!worldId) throw new Error('Choose a world');
      return reply({ players: required(await admin.rpc('mosslight_room_players', { p_user: userId, p_world: worldId })) });
    }
    if (type === 'rename') {
      if (!worldId) throw new Error('Choose a world');
      const name = worldName(body.name);
      if (!(await limited(`rename:${userId}`, 6, 60))) return reply({ error: 'Please wait before renaming again' }, 429);
      return reply({ name: required(await admin.rpc('mosslight_rename', { p_user: userId, p_world: worldId, p_name: name })) });
    }
    if (type === "join") {
      if (!worldId) throw new Error("Choose a world");
      return reply({ data: required(await admin.rpc("mosslight_join", { p_user: userId, p_world: worldId })) });
    }
    if (type === "leave") {
      if (worldId) required(await admin.rpc("mosslight_leave", { p_user: userId, p_world: worldId }));
      return reply({ ok: true });
    }
    if (type === "social") {
      const action = body.action;
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!["request", "accept", "remove", "builder", "viewer"].includes(String(action)) || !/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("Invalid friend action");
      if (!(await limited(`social:${userId}`, 20, 60))) return reply({ error: "Try again later" }, 429);
      return reply({ data: required(await admin.rpc("mosslight_social", { p_user: userId, p_action: action, p_target: username, p_world: worldId ?? null })) });
    }
    const current = await state(userId, worldId);
    if (!current.session || Date.parse(current.session.expires_at) <= Date.now()) throw new Error("World session expired; join again");
    const session = current.session.state;
    if (type === 'chat') {
      const text = chatText(body.text);
      if (!(await limited(`chat:${userId}`, 1, 2))) return reply({ error: 'Wait two seconds between messages' }, 429);
      // Broadcast through the HTTP API: unlike realtime.send, message content is not inserted into Postgres.
      const payload = { userId, username: current.profile.username, text, expiresAt: Date.now()+chatDuration(text) };
      const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method:'POST', headers:{ apikey:secret, Authorization:`Bearer ${secret}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ messages:[{ topic:`mosslight:${current.world.id}`, event:'chat', payload, private:true }] }),
      });
      if (!response.ok) throw new Error('Message could not be delivered');
      return reply({ message:payload });
    }
    if (type === "position") {
      const x = Number(body.x), y = Number(body.y), facing = Number(body.facing);
      const next = moveSession(session, current.world.state, current.world.seed, x, y, facing, Date.now());
      if (!required(await admin.rpc("mosslight_position", { p_user: userId, p_world: current.world.id, p_state: next }))) throw new Error("World session expired");
      return reply({ ok: true });
    }
    if (type === "action") {
      if (!(await limited(`edit:${userId}`, 90, 60))) return reply({ error: "Slow down a little" }, 429);
      const kind = body.kind;
      if (kind !== "hit" && kind !== "place" && kind !== "spin") throw new Error("Unknown game action");
      if (!Number.isInteger(body.selected) || Number(body.selected) < 0 || Number(body.selected) >= 8) throw new Error("Choose a hotbar slot");
      const profile = structuredClone(current.profile.state);
      profile.selected = Number(body.selected);
      // Older clients update position separately; new clients include it here to avoid a second request.
      const moved = body.playerX === undefined && body.playerY === undefined && body.facing === undefined
        ? session
        : moveSession(session, current.world.state, current.world.seed,
          Number(body.playerX), Number(body.playerY), Number(body.facing), Date.now());
      const applied = applyAction({ world: current.world.state, profile, session: moved,
        seed: current.world.seed, kind, x: Number(body.x), y: Number(body.y), now: Date.now(), canBuild: current.canBuild });
      const next = await commit(userId, current, applied.changed ? applied.world : null,
        applied.changed ? applied.profile : null, applied.session, applied.event ? { ...applied.event, actor: userId } : null);
      return reply({ data: next, message: applied.message, changed: applied.changed,
        spin: applied.event?.kind === "wheel" ? applied.event : null });
    }
    if (type === "purchase") {
      const offerId = typeof body.offerId === "string" ? body.offerId : "";
      const profile = applyShop(current.profile.state, offerId);
      return reply({ data: await commit(userId, current, null, profile, null, null), message: "Purchase complete" });
    }
    if (type === "profile") {
      const profile = structuredClone(current.profile.state);
      if (Number.isInteger(body.selected) && Number(body.selected) >= 0 && Number(body.selected) < 8) profile.selected = Number(body.selected);
      if (typeof body.sound === "boolean") profile.sound = body.sound;
      if (["moved", "jumped", "backpack"].includes(String(body.guide))) profile.guide[String(body.guide)] = true;
      if (Number.isInteger(body.from) && Number.isInteger(body.to)) {
        const from = Number(body.from), to = Number(body.to);
        if (from < 0 || from >= 32 || to < 0 || to >= 32) throw new Error("Invalid backpack slots");
        const a = profile.inventory[from], b = profile.inventory[to];
        if (a && from !== to) {
          if (b?.id === a.id) {
            const n = Math.min(999 - b.count, a.count); b.count += n; a.count -= n;
            if (!a.count) profile.inventory[from] = null;
          } else [profile.inventory[from], profile.inventory[to]] = [b, a];
        }
      }
      return reply({ data: await commit(userId, current, null, profile, null, null) });
    }
    throw new Error("Unknown request");
  } catch (error) {
    console.error("Mosslight game error", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return reply({ error: message.length < 160 ? message : "Something went wrong" }, /expired|sign in/i.test(message) ? 401 : /retry|State changed/i.test(message) ? 409 : 400);
  }
});
