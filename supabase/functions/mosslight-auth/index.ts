import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { initialProfile, initialWorld, usernamePattern } from "../_shared/mosslight.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
async function capacityFull() {
  const { data, error } = await admin.rpc("mosslight_capacity_full");
  if (error) throw error;
  return data === true;
}
async function limited(key: string, max: number, seconds: number) {
  const { data, error } = await admin.rpc("mosslight_take_limit", { p_key: key, p_max: max, p_window_seconds: seconds });
  if (error) throw error;
  return data === true;
}
async function verifyCaptcha(token: string | undefined) {
  const secret = Deno.env.get("MOSS_TURNSTILE_SECRET");
  if (!secret) return true; // Global and per-account caps still apply until Turnstile is configured.
  if (!token || token.length > 2048) return false;
  const form = new FormData(); form.set("secret", secret); form.set("response", token);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return !!(await result.json()).success;
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    if (Number(request.headers.get("content-length")) > 4096) return reply({ error: "Request too large" }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "Request too large" }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = body.action;
    if (action === "status") return reply({ databaseFull: await capacityFull() });
    if (action === "username" || action === "password") {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) return reply({ error: "Sign in first" }, 401);
      const { data: userData, error: userError } = await auth.auth.getUser(token);
      if (userError || !userData.user) return reply({ error: "Session expired" }, 401);
      const userId = userData.user.id;
      if (!(await limited(`account:${userId}`, 8, 900))) return reply({ error: "Try again in a few minutes" }, 429);
      if (action === "username") {
        const next = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
        if (!usernamePattern.test(next)) return reply({ error: "Use 3–20 letters, numbers or underscores" }, 400);
        const { data, error } = await admin.rpc("mosslight_change_username", { p_user: userId, p_username: next });
        if (error) return reply({ error: /already taken/i.test(error.message) ? "Username already taken" : "Could not change username" }, 400);
        return reply({ username: data });
      }
      const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (oldPassword.length < 10 || oldPassword.length > 72 || newPassword.length < 10 || newPassword.length > 72)
        return reply({ error: "Use a 10–72 character password" }, 400);
      if (body.confirmPassword !== newPassword) return reply({ error: "Passwords do not match" }, 400);
      if (oldPassword === newPassword) return reply({ error: "Choose a different password" }, 400);
      const { data: email, error: emailError } = await admin.rpc("mosslight_account_email", { p_user: userId });
      if (emailError || !email) throw emailError ?? new Error("Profile not found");
      const verifier = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: passwordError } = await verifier.auth.signInWithPassword({ email, password: oldPassword });
      if (passwordError) return reply({ error: "Old password is incorrect" }, 401);
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      if (updateError) throw updateError;
      return reply({ ok: true });
    }
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!usernamePattern.test(username) || password.length < 10 || password.length > 72)
      return reply({ error: "Use a 3–20 character username and a 10–72 character password" }, 400);
    if (!(await limited("auth-global", 120, 60))) return reply({ error: "Try again soon" }, 429);
    if (action === "register") {
      if (body.confirmPassword !== password) return reply({ error: "Passwords do not match" }, 400);
      if (!(await limited("register-global", 6, 60))) return reply({ error: "Registration is busy; try later" }, 429);
      if (!(await verifyCaptcha(typeof body.captcha === "string" ? body.captcha : undefined)))
        return reply({ error: "Please complete the security check" }, 403);
      const email = `${crypto.randomUUID()}@mosslight.invalid`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (createError || !created.user) throw createError ?? new Error("Could not register");
      try {
        const seed = Math.floor(Math.random() * 2147483647);
        const { error } = await admin.rpc("mosslight_register", {
          p_user: created.user.id, p_username: username, p_email: email, p_seed: seed,
          p_profile: initialProfile(), p_world: initialWorld(seed),
        });
        if (error) throw error;
      } catch (error) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw error;
      }
    } else if (action !== "login") return reply({ error: "Unknown action" }, 400);
    const { data: email, error: lookupError } = await admin.rpc("mosslight_auth_email", { p_username: username });
    if (lookupError) throw lookupError;
    if (!email) return reply({ error: "Invalid username or password" }, 401);
    if (!(await limited(`login:${username}`, 8, 900))) return reply({ error: "Try again in a few minutes" }, 429);
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.session) return reply({ error: "Invalid username or password" }, 401);
    return reply({ session: data.session, username });
  } catch (error) {
    console.error("Mosslight auth error", error);
    if (await capacityFull().catch(() => false))
      return reply({ error: "Database storage limit reached", code: "DATABASE_FULL" }, 507);
    const message = error instanceof Error && /username|Registration is currently full/i.test(error.message)
      ? error.message : "Could not complete sign in";
    return reply({ error: message }, 400);
  }
});
