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
export class OnlineClient {
  private client = createClient(url!, key!, { auth: { autoRefreshToken: true, persistSession: true } });
  private channel?: RealtimeChannel;
  snapshot?: OnlineSnapshot;
  onWorldEvent: (event: Record<string, unknown>) => void = () => {};
  onPeerMove: (userId: string, payload: Record<string, unknown>) => void = () => {};
  onPresence: (players: { userId: string; username: string }[]) => void = () => {};
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
    this.snapshot = result.data;
    const me = result.data.profile;
    await this.client.realtime.setAuth((await this.client.auth.getSession()).data.session!.access_token);
    const channel = this.client.channel(`mosslight:${worldId}`, { config: { private: true, presence: { key: me.user_id } } });
    channel.on("broadcast", { event: "world" }, ({ payload }) => {
      if (payload && typeof payload === "object") this.onWorldEvent(payload as Record<string, unknown>);
    });
    channel.on("broadcast", { event: "move" }, ({ payload }) => {
      if (payload && typeof payload.userId === "string" && payload.userId !== me.user_id) this.onPeerMove(payload.userId, payload);
    });
    channel.on("presence", { event: "sync" }, () => {
      const values = Object.values(channel.presenceState()).flat();
      this.onPresence(values.flatMap((v) => {
        const player = v as unknown as { userId?: unknown; username?: unknown };
        return typeof player.userId === "string" && typeof player.username === "string" && player.userId !== me.user_id
          ? [{ userId: player.userId, username: player.username }] : [];
      }));
    });
    await new Promise<void>((resolve, reject) => channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try { await channel.track({ userId: me.user_id, username: me.username }); resolve(); }
        catch (error) { reject(error); }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error("Could not join live world"));
    }));
    this.channel = channel;
    return result.data;
  }
  async leave() {
    const worldId = this.snapshot?.world.id;
    if (this.channel) { await this.client.removeChannel(this.channel); this.channel = undefined; }
    if (worldId) await this.invoke("mosslight-game", { type: "leave", worldId }).catch(() => {});
  }
  async social(action: "request" | "accept" | "remove" | "builder" | "viewer", username: string, worldId?: string) {
    const result = await this.invoke<{ data: OnlineSnapshot }>("mosslight-game", { type: "social", action, username, worldId });
    this.snapshot = result.data;
    return result.data;
  }
  async position(x: number, y: number, facing: number) {
    return this.invoke("mosslight-game", { type: "position", worldId: this.snapshot!.world.id, x, y, facing });
  }
  async action(kind: "hit" | "place", x: number, y: number, selected: number) {
    const result = await this.invoke<{ data: OnlineSnapshot; message: string; changed: boolean }>("mosslight-game", { type: "action", worldId: this.snapshot!.world.id, kind, x, y, selected });
    this.snapshot = result.data;
    return result;
  }
  async purchase(offerId: string) {
    const result = await this.invoke<{ data: OnlineSnapshot; message: string }>("mosslight-game", { type: "purchase", worldId: this.snapshot!.world.id, offerId });
    this.snapshot = result.data;
    return result;
  }
  async profile(update: Record<string, unknown>) {
    const result = await this.invoke<{ data: OnlineSnapshot }>("mosslight-game", { type: "profile", worldId: this.snapshot!.world.id, ...update });
    this.snapshot = result.data;
    return result.data;
  }
}
