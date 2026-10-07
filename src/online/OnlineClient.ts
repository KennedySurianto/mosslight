import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { ProfileState, SessionState, WorldState } from "../../supabase/functions/_shared/mosslight";

export interface OnlineSnapshot {
  profile: { user_id: string; username: string; state: ProfileState; revision: number };
  world: { id: string; owner_id: string; name: string; seed: number; state: WorldState; revision: number };
  session: { state: SessionState } | null;
  canBuild: boolean;
  worlds: { id: string; name: string; owner: string; ownerId: string }[];
  friends: { username: string; userId: string; status: string; incoming: boolean }[];
}
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const onlineConfigured = !!url && !!key;
export type Peer = { userId: string; username: string; x: number; y: number; facing: number };
export type PlayerResult = { userId: string; username: string; status: string; incoming: boolean; world: { id: string; name: string } | null };
export type PlayerLocation = { worldId: string; name: string; own: boolean; owner: string } | null;
export type ChatMessage = { userId: string; username: string; text: string; expiresAt: number };
export class OnlineClient {
  private client = createClient(url!, key!, { auth: { autoRefreshToken: true, persistSession: true } });
  private channel?: RealtimeChannel;
  private rosterTimer?: ReturnType<typeof setInterval>;
  private rosterPending = false;
  private roomGeneration = 0;
  private membershipRevision = 0;
  private activeRoom?: string;
  peers: Peer[] = [];
  snapshot?: OnlineSnapshot;
  onWorldEvent: (event: Record<string, unknown>) => void = () => {};
  onPeerMove: (userId: string, payload: Record<string, unknown>) => void = () => {};
  onPresence: (players: Peer[]) => void = () => {};
  onChat: (message: ChatMessage) => void = () => {};
  constructor() {
    this.client.auth.onAuthStateChange((_event, session) => {
      if (session) void this.client.realtime.setAuth(session.access_token);
    });
  }
  async currentUser() {
    const { data } = await this.client.auth.getUser();
    return data.user;
  }
  async signOut() {
    await this.leave();
    await this.client.auth.signOut();
  }
  private async invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data: sessionData } = await this.client.auth.getSession();
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", apikey: key!,
        ...(sessionData.session ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({ error: "Server did not respond" }));
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result as T;
  }
  async auth(action: "login" | "register", username: string, password: string, confirmPassword?: string, captcha?: string) {
    const result = await this.invoke<{ session: { access_token: string; refresh_token: string } }>("mosslight-auth", { action, username, password, confirmPassword, captcha });
    const { error } = await this.client.auth.setSession(result.session);
    if (error) throw error;
    return this.refresh();
  }
  async refresh(worldId?: string) {
    const result = await this.invoke<{ data: OnlineSnapshot }>("mosslight-game", { type: "state", worldId });
    this.snapshot = result.data;
    return result.data;
  }
  async join(worldId: string) {
    const result = await this.invoke<{ data: OnlineSnapshot }>("mosslight-game", { type: "join", worldId });
    this.roomGeneration++;
    const generation = this.roomGeneration;
    clearInterval(this.rosterTimer);
    this.activeRoom = worldId;
    this.peers = [];
    this.onPresence([]);
    if (this.channel) { await this.client.removeChannel(this.channel); this.channel = undefined; }
    this.snapshot = result.data;
    const me = result.data.profile;
    await this.client.realtime.setAuth((await this.client.auth.getSession()).data.session!.access_token);
    const channel = this.client.channel(`mosslight:${worldId}`, { config: { private: true, presence: { key: me.user_id, enabled: true } } });
    channel.on("broadcast", { event: "world" }, ({ payload }) => {
      if (generation !== this.roomGeneration) return;
      if (payload?.kind === 'departure') {
        this.membershipRevision++;
        this.peers = this.peers.filter(p => p.userId !== payload.userId);
        this.onPresence(this.peers);
      }
      if (payload?.kind === 'rename' && this.snapshot?.world.id === worldId) this.snapshot.world.name = String(payload.name);
      if (payload && typeof payload === "object") this.onWorldEvent(payload as Record<string, unknown>);
    });
    channel.on("broadcast", { event: "move" }, ({ payload }) => {
      if (generation !== this.roomGeneration) return;
      if (payload && this.peers.some(p => p.userId === payload.userId)) this.onPeerMove(payload.userId, payload);
    });
    channel.on('broadcast', { event:'chat' }, ({ payload }) => {
      if (generation === this.roomGeneration && payload && typeof payload.text === 'string' && payload.text.length <= 140 &&
        (payload.userId === me.user_id || this.peers.some(p => p.userId === payload.userId))) this.onChat(payload as ChatMessage);
    });
    channel.on("presence", { event: "sync" }, () => {
      if (generation !== this.roomGeneration) return;
      // Presence only removes known server identities; never trust client-supplied names.
      const keys = new Set(Object.keys(channel.presenceState()));
      this.peers = this.peers.filter(p => keys.has(p.userId));
      this.onPresence(this.peers);
      void this.syncRoster();
    });
    await new Promise<void>((resolve, reject) => channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try { await channel.track({ userId: me.user_id, username: me.username }); resolve(); }
        catch (error) { reject(error); }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === 'CLOSED') {
        if (generation === this.roomGeneration) { this.peers=[]; this.onPresence([]); }
        reject(new Error("Could not join live world"));
      }
    }));
    this.channel = channel;
    await this.syncRoster();
    this.rosterTimer = setInterval(() => void this.syncRoster(), 10000);
    return result.data;
  }
  private async syncRoster() {
    if (!this.activeRoom || this.rosterPending) return;
    const worldId = this.activeRoom, generation = this.roomGeneration, revision = this.membershipRevision;
    this.rosterPending = true;
    try {
      const result = await this.invoke<{ players: Peer[] }>('mosslight-game', { type:'roster', worldId });
      if (generation !== this.roomGeneration || revision !== this.membershipRevision) return;
      const keys = this.channel ? new Set(Object.keys(this.channel.presenceState())) : null;
      this.peers = result.players.filter(p => p.userId !== this.snapshot?.profile.user_id && (!keys || keys.has(p.userId)));
      this.onPresence(this.peers);
    } catch { /* Keep the last roster during a transient outage; presence still removes disconnects. */ }
    finally { this.rosterPending = false; }
  }
  async leave() {
    this.roomGeneration++;
    this.activeRoom = undefined;
    clearInterval(this.rosterTimer);
    this.peers = [];
    this.onPresence([]);
    const worldId = this.snapshot?.world.id;
    if (this.channel) { await this.client.removeChannel(this.channel); this.channel = undefined; }
    if (worldId) await this.invoke("mosslight-game", { type: "leave", worldId }).catch(() => {});
  }
  async social(action: "request" | "accept" | "remove" | "builder" | "viewer", username: string, worldId?: string) {
    const result = await this.invoke<{ data: OnlineSnapshot }>("mosslight-game", { type: "social", action, username, worldId });
    if (this.snapshot) {
      this.snapshot.worlds = result.data.worlds;
      this.snapshot.friends = result.data.friends;
    }
    return result.data;
  }
  async position(x: number, y: number, facing: number) {
    return this.invoke("mosslight-game", { type: "position", worldId: this.snapshot!.world.id, x, y, facing });
  }
  async players(query: string, after = '') {
    return this.invoke<{ players: PlayerResult[]; next: string | null }>('mosslight-game', { type:'players', query, after });
  }
  async locations() {
    return this.invoke<{ locations: { userId: string; location: PlayerLocation }[] }>('mosslight-game', { type:'locations' });
  }
  async chat(text: string) {
    const worldId=this.activeRoom;
    const result = await this.invoke<{ message: ChatMessage }>('mosslight-game', { type:'chat', worldId, text });
    if (worldId===this.activeRoom) this.onChat(result.message);
  }
  async rename(name: string) {
    const worldId = this.activeRoom;
    const result = await this.invoke<{ name: string }>('mosslight-game', { type:'rename', worldId, name });
    if (this.snapshot && this.snapshot.world.id === worldId) {
      this.snapshot.world.name = result.name;
      const own = this.snapshot.worlds.find(w => w.id === worldId);
      if (own) own.name = result.name;
    }
    return result.name;
  }
  async action(kind: "hit" | "place", x: number, y: number, selected: number, playerX: number, playerY: number, facing: number) {
    const result = await this.invoke<{ data: OnlineSnapshot; message: string; changed: boolean }>("mosslight-game", { type: "action", worldId: this.snapshot!.world.id, kind, x, y, selected, playerX, playerY, facing });
    if (this.activeRoom===result.data.world.id) this.snapshot = result.data;
    return result;
  }
  async purchase(offerId: string) {
    const result = await this.invoke<{ data: OnlineSnapshot; message: string }>("mosslight-game", { type: "purchase", worldId: this.snapshot!.world.id, offerId });
    if (this.activeRoom===result.data.world.id) this.snapshot = result.data;
    return result;
  }
  async profile(update: Record<string, unknown>) {
    const result = await this.invoke<{ data: OnlineSnapshot }>("mosslight-game", { type: "profile", worldId: this.snapshot!.world.id, ...update });
    if (this.activeRoom===result.data.world.id) this.snapshot = result.data;
    return result.data;
  }
}
