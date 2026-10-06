import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { initialProfile, initialWorld, usernamePattern } from "../_shared/mosslight.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
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
    const message = error instanceof Error && /username|Registration is currently full/i.test(error.message)
      ? error.message : "Could not complete sign in";
    return reply({ error: message }, 400);
  }
});
