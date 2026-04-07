/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import Stripe from "stripe";
import {
  studioMiddleware,
  Queryable,
  QueryableHandler,
  RawFn
} from "queryable-object";

const GLOBAL_DO_NAME = "__global99__";
// ============================================================================
// Types
// ============================================================================

export interface Env {
  USER_DO: DurableObjectNamespace<UserDO & QueryableHandler>;
  SYNC_QUEUE: Queue<SyncJob>;
  X_CLIENT_ID: string;
  X_CLIENT_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY_B64: string; // PEM
  GITHUB_APP_SLUG: string; // e.g. "x-archive-sync"
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  STRIPE_SECRET: string;
  STRIPE_WEBHOOK_SIGNING_SECRET: string;
  STRIPE_PRICE_ID: string;
  JWT_SECRET: string;
  APP_URL: string; // e.g. https://xarchive.example.com
}

interface JWTPayload {
  sub: string; // x user id
  username: string;
  exp: number;
}

interface SyncJob {
  userId: string;
}

// ============================================================================
// JWT Helpers
// ============================================================================

async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${body}`)
  );
  const signature = b64urlBytes(new Uint8Array(sig));
  return `${header}.${body}.${signature}`;
}

async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const [header, body, signature] = token.split(".");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload: JWTPayload = JSON.parse(
      atob(body.replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ============================================================================
// GitHub App JWT (RS256)
// ============================================================================

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signGitHubAppJWT(
  appId: string,
  privateKeyPem: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId })
  );
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64urlBytes(new Uint8Array(sig))}`;
}

async function getInstallationToken(
  installationId: number,
  env: Env
): Promise<string> {
  const pem = atob(env.GITHUB_APP_PRIVATE_KEY_B64);
  const appJwt = await signGitHubAppJWT(env.GITHUB_APP_ID, pem);
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "x-archive-sync"
      }
    }
  );
  if (!res.ok) {
    throw new Error(
      `Failed to get installation token: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

// ============================================================================
// PKCE / Random helpers
// ============================================================================

async function generateRandomString(length: number): Promise<string> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return b64urlBytes(new Uint8Array(digest));
}

// ============================================================================
// Cookie helpers
// ============================================================================

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(";").forEach((c) => {
    const [name, ...rest] = c.trim().split("=");
    if (name && rest.length) cookies[name] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

function secureCookieFlags(url: URL): string {
  return url.hostname === "localhost" ? "" : "Secure; ";
}

async function getAuthFromRequest(
  request: Request,
  env: Env
): Promise<JWTPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyJWT(authHeader.slice(7), env.JWT_SECRET);
  }
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  if (cookies.jwt) return verifyJWT(cookies.jwt, env.JWT_SECRET);
  return null;
}

function getRegistry(env: Env): DurableObjectStub<UserDO & { raw: RawFn }> {
  return env.USER_DO.get(env.USER_DO.idFromName(GLOBAL_DO_NAME));
}

// ============================================================================
// Main Worker
// ============================================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const secure = secureCookieFlags(url);

    // ── Home ──
    if (path === "/") {
      const auth = await getAuthFromRequest(request, env);
      if (auth) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/dashboard" }
        });
      }
      return new Response(renderLanding(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // ── X OAuth ──
    if (path === "/auth/x/login") {
      const state = await generateRandomString(16);
      const codeVerifier = await generateRandomString(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const redirect_uri = `${url.origin}/auth/x/callback`;

      const authUrl = new URL("https://x.com/i/oauth2/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", env.X_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirect_uri);
      authUrl.searchParams.set(
        "scope",
        "bookmark.read tweet.read users.read offline.access"
      );
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const headers = new Headers({ Location: authUrl.toString() });
      headers.append(
        "Set-Cookie",
        `x_oauth_state=${state}; HttpOnly; Path=/; ${secure}SameSite=Lax; Max-Age=600`
      );
      headers.append(
        "Set-Cookie",
        `x_code_verifier=${codeVerifier}; HttpOnly; Path=/; ${secure}SameSite=Lax; Max-Age=600`
      );
      return new Response("Redirecting", { status: 307, headers });
    }

    if (path === "/auth/x/callback") {
      const code = url.searchParams.get("code");
      const urlState = url.searchParams.get("state");
      const cookies = parseCookies(request.headers.get("Cookie") || "");

      if (
        !code ||
        !urlState ||
        urlState !== cookies.x_oauth_state ||
        !cookies.x_code_verifier
      ) {
        return new Response("Invalid OAuth state", { status: 400 });
      }

      const redirect_uri = `${url.origin}/auth/x/callback`;
      const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(
            `${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`
          )}`
        },
        body: new URLSearchParams({
          code,
          client_id: env.X_CLIENT_ID,
          grant_type: "authorization_code",
          redirect_uri,
          code_verifier: cookies.x_code_verifier
        })
      });

      if (!tokenResponse.ok) {
        return new Response(
          `Token exchange failed: ${await tokenResponse.text()}`,
          { status: 500 }
        );
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const meRes = await fetch(
        "https://api.x.com/2/users/me?user.fields=profile_image_url",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const meData = (await meRes.json()) as any;
      const xUser = meData.data;

      const stub = getRegistry(env);
      await stub.setXAuth({
        userId: xUser.id,
        username: xUser.username,
        name: xUser.name,
        profileImageUrl: xUser.profile_image_url || "",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        expiresAt: Date.now() + (tokens.expires_in || 7200) * 1000
      });

      const jwt = await signJWT(
        {
          sub: xUser.id,
          username: xUser.username,
          exp: Date.now() + 30 * 24 * 60 * 60 * 1000
        },
        env.JWT_SECRET
      );

      const headers = new Headers({ Location: "/dashboard" });
      headers.append(
        "Set-Cookie",
        `x_oauth_state=; HttpOnly; Path=/; ${secure}SameSite=Lax; Max-Age=0`
      );
      headers.append(
        "Set-Cookie",
        `x_code_verifier=; HttpOnly; Path=/; ${secure}SameSite=Lax; Max-Age=0`
      );
      headers.append(
        "Set-Cookie",
        `jwt=${jwt}; HttpOnly; Path=/; ${secure}SameSite=Lax; Max-Age=${
          30 * 24 * 60 * 60
        }`
      );
      return new Response("Redirecting", { status: 302, headers });
    }

    // ── GitHub App install ──
    // User clicks this after creating their private repo. Redirects to GitHub
    // App install page. GitHub will redirect back to /auth/github/callback
    // with installation_id and setup_action.
    if (path === "/auth/github/install") {
      const auth = await getAuthFromRequest(request, env);
      if (!auth) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/" }
        });
      }
      const installUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${auth.sub}`;
      return new Response(null, {
        status: 302,
        headers: { Location: installUrl }
      });
    }

    if (path === "/auth/github/callback") {
      const installationId = url.searchParams.get("installation_id");
      const setupAction = url.searchParams.get("setup_action");
      const state = url.searchParams.get("state"); // we passed x user id

      if (!installationId || !state) {
        return new Response("Missing installation_id or state", {
          status: 400
        });
      }

      // Verify the installation & fetch repo info
      const token = await getInstallationToken(parseInt(installationId), env);
      const reposRes = await fetch(
        "https://api.github.com/installation/repositories",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "x-archive-sync"
          }
        }
      );
      if (!reposRes.ok) {
        return new Response(
          `Failed to verify installation: ${await reposRes.text()}`,
          { status: 500 }
        );
      }
      const reposData = (await reposRes.json()) as {
        repositories: {
          full_name: string;
          name: string;
          owner: { login: string };
        }[];
      };

      if (!reposData.repositories.length) {
        return new Response("No repository selected for installation", {
          status: 400
        });
      }

      // Use the first repo as the target. User was told to scope to one repo.
      const targetRepo = reposData.repositories[0];

      const stub = getRegistry(env);
      await stub.setGitHubInstall(state, {
        installationId: parseInt(installationId),
        owner: targetRepo.owner.login,
        repo: targetRepo.name,
        folder: "" // default to root
      });

      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" }
      });
    }

    // ── Logout ──
    if (path === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": `jwt=; HttpOnly; Path=/; ${secure}SameSite=Lax; Max-Age=0`
        }
      });
    }

    // ── Stripe webhook ──
    if (path === "/webhook/stripe" && request.method === "POST") {
      const stripe = new Stripe(env.STRIPE_SECRET, {
        apiVersion: "2025-12-15.clover"
      });
      const rawBody = await request.text();
      const sig = request.headers.get("stripe-signature");
      if (!sig)
        return Response.json({ error: "No signature" }, { status: 400 });

      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          sig,
          env.STRIPE_WEBHOOK_SIGNING_SECRET
        );
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 400 });
      }

      const registry = getRegistry(env);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid" && session.client_reference_id) {
          await registry.activateSubscription(
            session.client_reference_id,
            session.customer as string,
            session.subscription as string
          );
        }
      }

      if (
        event.type === "customer.subscription.deleted" ||
        event.type === "invoice.payment_failed"
      ) {
        const obj = event.data.object as any;
        const xUserId =
          obj.metadata?.x_user_id ||
          obj.subscription_details?.metadata?.x_user_id;
        if (xUserId) {
          await registry.deactivateSubscription(xUserId);
        }
      }

      return Response.json({ received: true });
    }

    // ── Create Stripe checkout ──
    if (path === "/api/create-checkout" && request.method === "POST") {
      const auth = await getAuthFromRequest(request, env);
      if (!auth)
        return Response.json({ error: "Unauthorized" }, { status: 401 });

      const stripe = new Stripe(env.STRIPE_SECRET, {
        apiVersion: "2025-12-15.clover"
      });
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        subscription_data: {
          metadata: { x_user_id: auth.sub }
        },
        client_reference_id: auth.sub,
        success_url: `${url.origin}/dashboard?subscribed=true`,
        cancel_url: `${url.origin}/dashboard`,
        allow_promotion_codes: true
      });

      return Response.json({ url: session.url });
    }

    // ── API: status ──
    if (path === "/api/status") {
      const auth = await getAuthFromRequest(request, env);
      if (!auth)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      return Response.json(await getRegistry(env).getStatus(auth.sub));
    }

    // ── API: set folder ──
    if (path === "/api/set-folder" && request.method === "POST") {
      const auth = await getAuthFromRequest(request, env);
      if (!auth)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const body = (await request.json()) as { folder?: string };
      await getRegistry(env).setFolder(auth.sub, body.folder || "");
      return Response.json({ ok: true });
    }

    // ── API: trigger manual sync ──
    if (path === "/api/sync-now" && request.method === "POST") {
      const auth = await getAuthFromRequest(request, env);
      if (!auth)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const registry = getRegistry(env);
      const alreadyQueued = await registry.setSyncQueued(auth.sub);
      if (alreadyQueued)
        return Response.json(
          { ok: false, reason: "already_queued" },
          { status: 409 }
        );
      await env.SYNC_QUEUE.send({ userId: auth.sub });
      return Response.json({ ok: true, queued: true });
    }

    // ── Dashboard ──
    if (path === "/dashboard") {
      const auth = await getAuthFromRequest(request, env);
      if (!auth) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/auth/x/login" }
        });
      }
      const status = await getRegistry(env).getStatus(auth.sub);
      return new Response(renderDashboard(status, env), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // ── Admin: Outerbase Studio (janwilmake only) ──
    if (path.startsWith("/admin")) {
      const auth = await getAuthFromRequest(request, env);
      if (!auth || auth.username !== "janwilmake") {
        return new Response("Forbidden", { status: 403 });
      }
      return studioMiddleware(request, getRegistry(env).raw, {
        dangerouslyDisableAuth: true
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  // ── Cron: every day, enqueue all subscribed users for sync ──
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const registry = getRegistry(env);
    const userIds = await registry.getSubscribedUserIds();
    // Enqueue in batches; Cloudflare queues support sendBatch up to 100
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100).map((userId) => ({
        body: { userId }
      }));
      await env.SYNC_QUEUE.sendBatch(batch);
    }
  },

  // ── Queue consumer: sync one user ──
  async queue(batch, env: Env) {
    const syncJobBatch = batch as MessageBatch<SyncJob>;

    for (const msg of syncJobBatch.messages) {
      try {
        await getRegistry(env).runSync(msg.body.userId);
        msg.ack();
      } catch (e) {
        console.error(`Sync failed for ${msg.body.userId}:`, e);
        msg.retry({ delaySeconds: 300 });
      }
    }
  }
} satisfies ExportedHandler<Env>;

// ============================================================================
// HTML renderers
// ============================================================================

function renderLanding(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grok Thyself</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#000;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;text-align:center}
.logo{width:100px;height:100px;object-fit:contain;animation:float 3.5s ease-in-out infinite;margin-bottom:32px}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
.eyebrow{font-size:13px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#555;margin-bottom:16px}
h1{font-size:clamp(40px,8vw,72px);font-weight:700;letter-spacing:-2px;line-height:1.05;margin-bottom:20px}
h1 em{font-style:normal;color:#888}
.sub{font-size:19px;color:#666;line-height:1.5;max-width:380px;margin:0 auto 40px}
.sub strong{color:#aaa;font-weight:500}
a.btn{display:inline-block;padding:16px 36px;background:#fff;color:#000;border-radius:980px;font-weight:600;font-size:16px;text-decoration:none;transition:opacity .15s}
a.btn:hover{opacity:.85}
.price{margin-top:20px;font-size:13px;color:#444}
</style>
</head><body>
<img class="logo" src="/socrates.png" alt="Socrates">
<p class="eyebrow">Personal knowledge base</p>
<h1>Your X data,<br><em>your knowledge.</em></h1>
<p class="sub">Bookmarks and posts, synced daily<br>to a private GitHub repo.</p>
<a class="btn" href="/auth/x/login">Sign in with X</a>
<p class="price">$8 / month &nbsp;·&nbsp; Cancel anytime</p>
</body></html>`;
}

function renderDashboard(status: UserStatus, env: Env): string {
  const check = (done: boolean) =>
    done
      ? `<span style="color:#34c759">✓</span>`
      : `<span style="color:#666">○</span>`;

  const step = (num: number, done: boolean, title: string, body: string) => `
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px;margin-bottom:16px;${
      done ? "border-color:rgba(52,199,89,.3)" : ""
    }">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="width:28px;height:28px;border-radius:50%;background:${
          done ? "rgba(52,199,89,.2)" : "rgba(255,255,255,.1)"
        };display:flex;align-items:center;justify-content:center;font-size:14px">${check(done)}</div>
        <div style="font-size:17px;font-weight:600">${num}. ${title}</div>
      </div>
      <div style="margin-left:40px;color:#888;font-size:14px;line-height:1.5">${body}</div>
    </div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grok Thyself</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:#000;color:#fff;margin:0}
.c{max-width:640px;margin:0 auto;padding:40px 24px 80px}
.btn{display:inline-block;padding:10px 20px;border-radius:980px;background:#fff;color:#000;text-decoration:none;font-size:14px;font-weight:500;border:none;cursor:pointer}
.btn-sec{background:rgba(255,255,255,.1);color:#fff}
.btn:disabled{opacity:.35;cursor:not-allowed;pointer-events:none}
input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.2);color:#fff;padding:8px 12px;border-radius:8px;font-size:14px;width:240px}
code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:4px;font-size:13px}
.logo{width:64px;height:64px;object-fit:contain;animation:float 3.5s ease-in-out infinite;flex-shrink:0}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes spin{to{transform:rotate(360deg)}}
.hero-eyebrow{font-size:11px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#555;margin-bottom:6px}
.hero-h1{font-size:28px;font-weight:700;letter-spacing:-0.5px;line-height:1.1;margin-bottom:4px}
.hero-h1 em{font-style:normal;color:#666}
.hero-sub{font-size:13px;color:#555;line-height:1.4}
.int-grid{display:flex;flex-direction:column;gap:12px;margin-top:16px}
.int-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px}
.int-card h3{font-size:14px;font-weight:600;margin-bottom:6px}
.int-card p{font-size:13px;color:#666;line-height:1.5;margin-bottom:10px}
.int-card code{font-size:12px}
.int-card-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.int-card-header img{border-radius:4px;flex-shrink:0}
.int-tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:980px;background:rgba(255,255,255,.07);color:#888;margin-bottom:6px}
</style></head><body>
<div class="c">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div style="display:flex;align-items:center;gap:16px">
      <img class="logo" src="/socrates.png" alt="Socrates">
      <div>
        <div class="hero-eyebrow">Personal knowledge base</div>
        <div class="hero-h1">Your X data,<br><em>your knowledge.</em></div>
        <div class="hero-sub">Bookmarks and posts, synced daily<br>to a private GitHub repo.</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding-top:4px;flex-shrink:0">
      <span style="color:#555;font-size:13px">@${status.xUser?.username || ""}</span>
      ${status.xUser?.username === "janwilmake" ? `<a href="/admin" style="color:#555;font-size:13px;text-decoration:none">Admin</a>` : ""}
      <a href="/auth/logout" style="color:#555;font-size:13px;text-decoration:none">Logout</a>
    </div>
  </div>
  <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin-bottom:28px">

  ${step(1, true, "Sign in with X", `Connected as @${status.xUser?.username || ""}`)}

  ${step(
    2,
    status.githubConnected,
    "Create a private GitHub repo",
    `Create an empty private repo (e.g. <code>x-archive</code>) in your GitHub account.<br>
     <a class="btn btn-sec" style="margin-top:12px" href="https://github.com/new?name=x-archive&visibility=private" target="_blank">Create repo on GitHub</a>`
  )}

  ${step(
    2,
    status.githubConnected,
    "Install the GitHub App on that one repo",
    status.githubConnected
      ? `Installed on <a href="https://github.com/${status.github?.owner}/${status.github?.repo}" target="_blank" style="color:#fff"><code>${status.github?.owner}/${status.github?.repo}</code></a>. <a href="/auth/github/install" style="color:#888;font-size:13px">Reinstall</a>`
      : `Select "Only select repositories" and pick just the repo you created.<br>
         <a class="btn" style="margin-top:12px" href="/auth/github/install">Install GitHub App</a>`
  )}

  ${
    status.githubConnected
      ? step(
          3,
          !!status.github?.folder || status.github?.folder === "",
          "Choose target folder (optional)",
          `Defaults to repo root. Posts go to <code>{folder}/x-posts/{id}.md</code>, bookmarks to <code>{folder}/x-bookmarks/{id}.md</code>.<br>
           <div style="margin-top:12px"><input id="folder" type="text" placeholder="(root)" value="${
             status.github?.folder || ""
           }"><button class="btn btn-sec" style="margin-left:8px" onclick="saveFolder()">Save</button></div>`
        )
      : ""
  }

  ${step(
    4,
    status.subscribed,
    "Subscribe — $8/month",
    status.subscribed
      ? `Active. Next sync runs daily.`
      : `<button class="btn" style="margin-top:12px" onclick="subscribe()">Subscribe</button>`
  )}

  ${
    status.subscribed && status.githubConnected
      ? `<div style="background:rgba(255,255,255,.05);border-radius:16px;padding:24px;margin-top:24px" id="sync-card">
           <div style="font-size:15px;margin-bottom:8px"><strong>Sync status</strong></div>
           <div style="color:#888;font-size:13px;line-height:1.7" id="sync-times"
             data-posts="${status.lastPostsSyncAt || ""}"
             data-bookmarks="${status.lastBookmarksSyncAt || ""}"
             data-error="${status.lastError || ""}">
           </div>
           <div id="sync-loading" style="display:none;margin-top:14px;color:#888;font-size:13px">
             <span style="display:inline-block;width:12px;height:12px;border:2px solid #555;border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:8px"></span>Syncing…
           </div>
           <button id="sync-btn" class="btn btn-sec" style="margin-top:16px" onclick="syncNow()" ${status.syncQueued ? "disabled" : ""}>Sync now</button>
         </div>`
      : ""
  }

  <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:40px 0 28px">
  <div style="font-size:17px;font-weight:600;margin-bottom:4px">Use it with your tools</div>
  <div style="font-size:13px;color:#555;margin-bottom:20px">Your archive is plain markdown files in a git repo — it works with anything.</div>
  <div class="int-grid">
    <div class="int-card">
      <div class="int-tag">Obsidian</div>
      <div class="int-card-header">
        <img src="https://www.google.com/s2/favicons?domain=obsidian.md&sz=32" width="20" height="20">
        <h3 style="margin:0">Obsidian Git</h3>
      </div>
      <p>Auto-pulls your repo into a vault folder on a schedule. Install the plugin and point it at your repo.</p>
      <a class="btn btn-sec" href="https://publish.obsidian.md/git-doc/Start+here" target="_blank" style="font-size:12px;padding:6px 14px">Docs →</a>
    </div>
    <div class="int-card">
      <div class="int-tag">Obsidian · mobile</div>
      <div class="int-card-header">
        <img src="https://www.google.com/s2/favicons?domain=obsidian.md&sz=32" width="20" height="20">
        <h3 style="margin:0">GitHub Gitless Sync</h3>
      </div>
      <p>Uses the GitHub API — works on iOS and Android without a git install.</p>
      <a class="btn btn-sec" href="https://github.com/silvanocerza/obsidian-github-sync" target="_blank" style="font-size:12px;padding:6px 14px">Docs →</a>
    </div>
    <div class="int-card">
      <div class="int-tag">Logseq</div>
      <div class="int-card-header">
        <img src="https://www.google.com/s2/favicons?domain=logseq.com&sz=32" width="20" height="20">
        <h3 style="margin:0">Logseq git sync</h3>
      </div>
      <p>Place the repo inside your graph's <code>pages/</code> directory and enable Logseq's built-in git auto-commit.</p>
      <a class="btn btn-sec" href="https://docs.logseq.com/#/page/git%20auto-commit" target="_blank" style="font-size:12px;padding:6px 14px">Docs →</a>
    </div>
    <div class="int-card">
      <div class="int-tag">Any tool</div>
      <div class="int-card-header">
        <img src="https://www.google.com/s2/favicons?domain=github.com&sz=32" width="20" height="20">
        <h3 style="margin:0">Local folder</h3>
      </div>
      <p>Clone once, then pull hourly:</p>
      <code style="display:block;background:rgba(255,255,255,.06);border-radius:6px;padding:8px 10px;font-size:11px;line-height:1.6;margin:8px 0;white-space:pre">git clone git@github.com:you/your-repo.git ~/knowledge/x
# add to crontab -e:
0 * * * * cd ~/knowledge/x &amp;&amp; git pull -q</code>
      <p style="margin-top:8px">Works with Cursor, VS Code, any LLM RAG pipeline — anything that reads a folder. Prefer a GUI? Use GitHub Desktop.</p>
      <a class="btn btn-sec" href="https://desktop.github.com/" target="_blank" style="font-size:12px;padding:6px 14px">GitHub Desktop →</a>
    </div>
  </div>
</div>

<script>
async function subscribe(){
  const r=await fetch('/api/create-checkout',{method:'POST'});
  const d=await r.json();
  if(d.url)location.href=d.url;else alert('Error: '+JSON.stringify(d));
}
async function saveFolder(){
  const f=document.getElementById('folder').value;
  await fetch('/api/set-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:f})});
  location.reload();
}

const FMT={timeZoneName:'short'};
function fmtDate(ms){return ms?new Date(ms).toLocaleString(undefined,FMT):'never';}
function renderSyncTimes(postsAt,bookmarksAt,error){
  const el=document.getElementById('sync-times');
  if(!el)return;
  el.innerHTML='Last posts sync: '+fmtDate(postsAt)+'<br>Last bookmarks sync: '+fmtDate(bookmarksAt)+
    (error?'<br><span style="color:#ff6b6b">Last error: '+error+'</span>':'');
}

let _polling=false;
function setSyncing(on){
  const btn=document.getElementById('sync-btn');
  const loading=document.getElementById('sync-loading');
  if(!btn||!loading)return;
  if(on){btn.disabled=true;loading.style.display='block';}
  else{btn.disabled=false;loading.style.display='none';}
}
function startPolling(){
  if(_polling)return;
  _polling=true;
  setSyncing(true);
  const interval=setInterval(async()=>{
    try{
      const r=await fetch('/api/status');
      const d=await r.json();
      if(!d.syncQueued){
        clearInterval(interval);
        _polling=false;
        setSyncing(false);
        renderSyncTimes(d.lastPostsSyncAt,d.lastBookmarksSyncAt,d.lastError);
      }
    }catch(e){}
  },3000);
}

// Format initial timestamps client-side
document.addEventListener('DOMContentLoaded',function(){
  const el=document.getElementById('sync-times');
  if(!el)return;
  renderSyncTimes(Number(el.dataset.posts)||null,Number(el.dataset.bookmarks)||null,el.dataset.error||null);
});
async function syncNow(){
  setSyncing(true);
  const r=await fetch('/api/sync-now',{method:'POST'});
  const d=await r.json();
  if(d.ok||d.reason==='already_queued'){startPolling();}
  else{setSyncing(false);}
}

// Auto-trigger first sync
(function(){
  const queued=${status.subscribed && status.githubConnected ? String(status.syncQueued) : "false"};
  const neverSynced=${status.subscribed && status.githubConnected ? String(!status.lastPostsSyncAt && !status.lastBookmarksSyncAt) : "false"};
  if(queued){startPolling();}
  else if(neverSynced){syncNow();}
})();
</script>
</body></html>`;
}

// ============================================================================
// Types
// ============================================================================

interface UserStatus {
  xUser: { username: string; name: string; profileImageUrl: string } | null;
  githubConnected: boolean;
  github: {
    installationId: number;
    owner: string;
    repo: string;
    folder: string;
  } | null;
  subscribed: boolean;
  syncQueued: boolean;
  lastPostsSyncAt: number | null;
  lastBookmarksSyncAt: number | null;
  lastError: string | null;
}

// ============================================================================
// Durable Object: UserDO (per-user + global registry)
// ============================================================================

@Queryable()
export class UserDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.init();
  }

  private init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      subscribed INTEGER DEFAULT 0,
      created_at INTEGER
    )`);

    // Migrate: add columns introduced after initial schema
    const existing = new Set(
      this.sql
        .exec("PRAGMA table_info(users)")
        .toArray()
        .map((r: any) => r.name as string)
    );
    const additions: [string, string][] = [
      ["name", "TEXT"],
      ["profile_image_url", "TEXT"],
      ["x_access_token", "TEXT"],
      ["x_refresh_token", "TEXT"],
      ["x_expires_at", "INTEGER DEFAULT 0"],
      ["gh_installation_id", "INTEGER"],
      ["gh_owner", "TEXT"],
      ["gh_repo", "TEXT"],
      ["gh_folder", "TEXT DEFAULT ''"],
      ["stripe_customer_id", "TEXT"],
      ["stripe_subscription_id", "TEXT"],
      ["last_posts_sync_at", "INTEGER"],
      ["last_bookmarks_sync_at", "INTEGER"],
      ["last_posts_since_id", "TEXT"],
      ["last_bookmarks_since_id", "TEXT"],
      ["last_error", "TEXT"],
      ["sync_queued", "INTEGER DEFAULT 0"]
    ];
    for (const [col, type] of additions) {
      if (!existing.has(col)) {
        this.sql.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
      }
    }
  }

  private row(userId: string): any {
    return (
      this.sql
        .exec("SELECT * FROM users WHERE user_id=? LIMIT 1", userId)
        .toArray()[0] ?? null
    );
  }

  async getSubscribedUserIds(): Promise<string[]> {
    return this.sql
      .exec("SELECT user_id FROM users WHERE subscribed=1")
      .toArray()
      .map((r) => r.user_id as string);
  }

  // ── Per-user methods ──

  async setXAuth(data: {
    userId: string;
    username: string;
    name: string;
    profileImageUrl: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }) {
    this.sql.exec(
      `INSERT INTO users (user_id, username, name, profile_image_url, x_access_token, x_refresh_token, x_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         username=excluded.username, name=excluded.name,
         profile_image_url=excluded.profile_image_url,
         x_access_token=excluded.x_access_token,
         x_refresh_token=excluded.x_refresh_token,
         x_expires_at=excluded.x_expires_at`,
      data.userId,
      data.username,
      data.name,
      data.profileImageUrl,
      data.accessToken,
      data.refreshToken,
      data.expiresAt,
      Date.now()
    );
  }

  async setGitHubInstall(
    userId: string,
    data: {
      installationId: number;
      owner: string;
      repo: string;
      folder: string;
    }
  ) {
    this.sql.exec(
      `UPDATE users SET gh_installation_id=?, gh_owner=?, gh_repo=?, gh_folder=? WHERE user_id=?`,
      data.installationId,
      data.owner,
      data.repo,
      data.folder,
      userId
    );
  }

  async setFolder(userId: string, folder: string) {
    this.sql.exec(
      `UPDATE users SET gh_folder=? WHERE user_id=?`,
      folder,
      userId
    );
  }

  /** Returns true if already queued (caller should reject), false if successfully marked queued. */
  async setSyncQueued(userId: string): Promise<boolean> {
    const u = this.row(userId);
    if (u?.sync_queued === 1) return true;
    this.sql.exec(`UPDATE users SET sync_queued=1 WHERE user_id=?`, userId);
    return false;
  }

  private clearSyncQueued(userId: string) {
    this.sql.exec(`UPDATE users SET sync_queued=0 WHERE user_id=?`, userId);
  }

  async activateSubscription(
    userId: string,
    stripeCustomerId: string,
    subscriptionId: string
  ) {
    this.sql.exec(
      `UPDATE users SET subscribed=1, stripe_customer_id=?, stripe_subscription_id=? WHERE user_id=?`,
      stripeCustomerId,
      subscriptionId,
      userId
    );
  }

  async deactivateSubscription(userId: string) {
    this.sql.exec(`UPDATE users SET subscribed=0 WHERE user_id=?`, userId);
  }

  async getStatus(userId: string): Promise<UserStatus> {
    const u = this.row(userId);
    return {
      xUser: u?.username
        ? {
            username: u.username,
            name: u.name || "",
            profileImageUrl: u.profile_image_url || ""
          }
        : null,
      githubConnected: !!u?.gh_installation_id,
      github: u?.gh_installation_id
        ? {
            installationId: u.gh_installation_id,
            owner: u.gh_owner,
            repo: u.gh_repo,
            folder: u.gh_folder || ""
          }
        : null,
      subscribed: u?.subscribed === 1,
      syncQueued: u?.sync_queued === 1,
      lastPostsSyncAt: u?.last_posts_sync_at || null,
      lastBookmarksSyncAt: u?.last_bookmarks_sync_at || null,
      lastError: u?.last_error || null
    };
  }

  // ── X token refresh ──

  private async getValidXToken(userId: string): Promise<string | null> {
    const u = this.row(userId);
    if (!u) return null;
    if (Date.now() < (u.x_expires_at || 0) - 60_000) return u.x_access_token;
    if (!u.x_refresh_token) return null;

    const res = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${this.env.X_CLIENT_ID}:${this.env.X_CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: u.x_refresh_token,
        client_id: this.env.X_CLIENT_ID
      })
    });
    if (!res.ok) return null;
    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    this.sql.exec(
      `UPDATE users SET x_access_token=?, x_refresh_token=?, x_expires_at=? WHERE user_id=?`,
      tokens.access_token,
      tokens.refresh_token || u.x_refresh_token,
      Date.now() + (tokens.expires_in || 7200) * 1000,
      userId
    );
    return tokens.access_token;
  }

  // ── Main sync entry ──

  async runSync(userId: string) {
    try {
      const u = this.row(userId);
      if (!u?.subscribed || !u?.gh_installation_id) return;

      const accessToken = await this.getValidXToken(userId);
      if (!accessToken) throw new Error("Could not get valid X token");

      const install = {
        installationId: u.gh_installation_id,
        owner: u.gh_owner,
        repo: u.gh_repo,
        folder: u.gh_folder || ""
      };
      const ghToken = await getInstallationToken(
        install.installationId,
        this.env
      );

      // Sync posts
      const newPostsSince = await this.syncPosts(
        u.user_id,
        accessToken,
        ghToken,
        install,
        u.last_posts_since_id || undefined
      );
      this.sql.exec(
        `UPDATE users SET last_posts_since_id=?, last_posts_sync_at=? WHERE user_id=?`,
        newPostsSince || u.last_posts_since_id,
        Date.now(),
        u.user_id
      );

      // Sync bookmarks
      const newBookmarksSince = await this.syncBookmarks(
        u.user_id,
        accessToken,
        ghToken,
        install,
        u.last_bookmarks_since_id || undefined
      );
      this.sql.exec(
        `UPDATE users SET last_bookmarks_since_id=?, last_bookmarks_sync_at=?, last_error='' WHERE user_id=?`,
        newBookmarksSince || u.last_bookmarks_since_id,
        Date.now(),
        u.user_id
      );
    } catch (e: any) {
      this.sql.exec(
        `UPDATE users SET last_error=? WHERE user_id=?`,
        String(e?.message || e),
        userId
      );
      throw e;
    } finally {
      this.clearSyncQueued(userId);
    }
  }

  private async syncPosts(
    userId: string,
    xToken: string,
    ghToken: string,
    install: { owner: string; repo: string; folder: string },
    sinceId?: string
  ): Promise<string | null> {
    const allTweets: any[] = [];
    const authorMap: Record<string, string> = {};
    const quotedMap: Record<string, any> = {};
    let nextToken: string | undefined;
    let newestId: string | undefined;

    do {
      const fetchUrl = new URL(`https://api.x.com/2/users/${userId}/tweets`);
      fetchUrl.searchParams.set("max_results", "100");
      fetchUrl.searchParams.set(
        "tweet.fields",
        "created_at,public_metrics,referenced_tweets,conversation_id,entities,author_id"
      );
      fetchUrl.searchParams.set(
        "expansions",
        "author_id,referenced_tweets.id,referenced_tweets.id.author_id"
      );
      fetchUrl.searchParams.set("user.fields", "username");
      if (sinceId) fetchUrl.searchParams.set("since_id", sinceId);
      if (nextToken) fetchUrl.searchParams.set("pagination_token", nextToken);

      const res = await fetch(fetchUrl.toString(), {
        headers: { Authorization: `Bearer ${xToken}` }
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`X posts fetch failed: ${res.status}`, body);
        throw new Error(`X posts fetch failed: ${res.status} ${body}`);
      }
      const data = (await res.json()) as {
        data?: any[];
        includes?: {
          users?: { id: string; username: string }[];
          tweets?: any[];
        };
        meta?: { newest_id?: string; next_token?: string };
      };

      if (!data.data?.length) break;
      if (!newestId) newestId = data.meta?.newest_id;

      for (const u of data.includes?.users || []) authorMap[u.id] = u.username;
      for (const t of data.includes?.tweets || []) quotedMap[t.id] = t;
      allTweets.push(...data.data);
      nextToken = data.meta?.next_token;
      if (allTweets.length >= 1000) break;
    } while (nextToken);

    const dateGroups: Record<string, any[]> = {};
    for (const tweet of allTweets) {
      const date = (tweet.created_at || "").slice(0, 10) || "unknown";
      if (!dateGroups[date]) dateGroups[date] = [];
      dateGroups[date].push(tweet);
    }

    for (const [date, tweets] of Object.entries(dateGroups)) {
      tweets.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      await this.writeDateFile(
        ghToken,
        install,
        `x-posts/${date}.md`,
        tweets,
        authorMap,
        quotedMap,
        date
      );
    }

    return newestId || null;
  }

  private async syncBookmarks(
    userId: string,
    xToken: string,
    ghToken: string,
    install: { owner: string; repo: string; folder: string },
    sinceId?: string
  ): Promise<string | null> {
    const allTweets: any[] = [];
    const authorMap: Record<string, string> = {};
    const quotedMap: Record<string, any> = {};
    let nextToken: string | undefined;
    let newestId: string | undefined;

    while (allTweets.length < 1000) {
      const fetchUrl = new URL(`https://api.x.com/2/users/${userId}/bookmarks`);
      fetchUrl.searchParams.set("max_results", "100");
      fetchUrl.searchParams.set(
        "tweet.fields",
        "created_at,author_id,public_metrics,referenced_tweets,conversation_id,entities"
      );
      fetchUrl.searchParams.set(
        "expansions",
        "author_id,referenced_tweets.id,referenced_tweets.id.author_id"
      );
      fetchUrl.searchParams.set("user.fields", "username");
      if (nextToken) fetchUrl.searchParams.set("pagination_token", nextToken);

      const res = await fetch(fetchUrl.toString(), {
        headers: { Authorization: `Bearer ${xToken}` }
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`X bookmarks fetch failed: ${res.status}`, body);
        throw new Error(`X bookmarks fetch failed: ${res.status} ${body}`);
      }
      const data = (await res.json()) as {
        data?: any[];
        includes?: {
          users?: { id: string; username: string }[];
          tweets?: any[];
        };
        meta?: { next_token?: string; newest_id?: string };
      };

      if (!data.data?.length) break;

      for (const u of data.includes?.users || []) authorMap[u.id] = u.username;
      for (const t of data.includes?.tweets || []) quotedMap[t.id] = t;
      if (!newestId) newestId = data.meta?.newest_id || data.data[0]?.id;

      let done = false;
      for (const tweet of data.data) {
        if (sinceId && tweet.id === sinceId) {
          done = true;
          break;
        }
        allTweets.push(tweet);
      }
      if (done || !data.meta?.next_token) break;
      nextToken = data.meta.next_token;
    }

    const dateGroups: Record<string, any[]> = {};
    for (const tweet of allTweets) {
      const date = (tweet.created_at || "").slice(0, 10) || "unknown";
      if (!dateGroups[date]) dateGroups[date] = [];
      dateGroups[date].push(tweet);
    }

    for (const [date, tweets] of Object.entries(dateGroups)) {
      tweets.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      await this.writeDateFile(
        ghToken,
        install,
        `x-bookmarks/${date}.md`,
        tweets,
        authorMap,
        quotedMap,
        date
      );
    }

    return newestId || null;
  }

  private expandUrls(
    text: string,
    entities?: {
      urls?: Array<{
        url: string;
        expanded_url?: string;
        unwound_url?: string;
        display_url?: string;
      }>;
    }
  ): string {
    if (!entities?.urls?.length) return text;
    let result = text;
    for (const u of entities.urls) {
      const resolved = u.unwound_url || u.expanded_url;
      if (resolved && u.url) result = result.split(u.url).join(resolved);
    }
    return result;
  }

  private quotedBlock(
    quoted: any,
    quotedAuthor?: string,
    label = "Quoting"
  ): string {
    const text = this.expandUrls(quoted.text || "", quoted.entities);
    const url = `https://x.com/${quotedAuthor || "i"}/status/${quoted.id}`;
    const mediaUrls: string[] = [];
    for (const u of quoted.entities?.urls || []) {
      if (
        u.display_url?.startsWith("pic.") ||
        (u.unwound_url || u.expanded_url || "").includes("twimg.com")
      ) {
        const resolved = u.unwound_url || u.expanded_url || u.url;
        if (resolved) mediaUrls.push(resolved);
      }
    }
    const lines: string[] = [
      `> **${label} [@${quotedAuthor || "unknown"}](${url})**`,
      `>`
    ];
    for (const line of text.split("\n")) lines.push(`> ${line}`);
    for (const murl of mediaUrls) {
      lines.push(`>`);
      lines.push(`> ![](${murl})`);
    }
    lines.push(`>`);
    lines.push(`> — [View on X](${url})`);
    return lines.join("\n");
  }

  private tweetSection(
    tweet: any,
    authorUsername?: string,
    quotedTweet?: any,
    quotedAuthor?: string,
    repliedToTweet?: any,
    repliedToAuthor?: string
  ): string {
    const text = this.expandUrls(tweet.text || "", tweet.entities);
    const url = `https://x.com/${authorUsername || "i"}/status/${tweet.id}`;
    const time = tweet.created_at
      ? new Date(tweet.created_at).toISOString().slice(11, 16)
      : "";
    const authorPart = authorUsername ? ` · @${authorUsername}` : "";
    const metrics = tweet.public_metrics
      ? `*♥ ${tweet.public_metrics.like_count || 0} · ↺ ${tweet.public_metrics.retweet_count || 0}*\n\n`
      : "";
    const repliedToPart = repliedToTweet
      ? "\n\n" +
        this.quotedBlock(repliedToTweet, repliedToAuthor, "In reply to")
      : "";
    const quotedPart = quotedTweet
      ? "\n\n" + this.quotedBlock(quotedTweet, quotedAuthor, "Quoting")
      : "";
    return `## ${time}${authorPart} · [↗](${url})\n<!-- tweet-id: ${tweet.id} -->\n\n${metrics}${text}${repliedToPart}${quotedPart}\n`;
  }

  private async writeDateFile(
    ghToken: string,
    install: { owner: string; repo: string; folder: string },
    relativePath: string,
    newTweets: any[],
    authorMap: Record<string, string>,
    quotedMap: Record<string, any>,
    date: string
  ) {
    const folder = install.folder
      ? install.folder.replace(/^\/+|\/+$/g, "")
      : "";
    const fullPath = folder ? `${folder}/${relativePath}` : relativePath;
    const apiUrl = `https://api.github.com/repos/${install.owner}/${install.repo}/contents/${encodeURIComponent(fullPath).replace(/%2F/g, "/")}`;
    const ghHeaders = {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "x-archive-sync"
    };

    const existing = await fetch(apiUrl, { headers: ghHeaders });
    let existingContent = "";
    let sha: string | undefined;

    if (existing.status === 200) {
      const existingData = (await existing.json()) as {
        sha: string;
        content: string;
      };
      sha = existingData.sha;
      existingContent = new TextDecoder().decode(
        Uint8Array.from(atob(existingData.content.replace(/\s/g, "")), (c) =>
          c.charCodeAt(0)
        )
      );
    }

    // Only append tweets not already present in the file
    const tweetsToAdd = newTweets.filter(
      (t) => !existingContent.includes(`<!-- tweet-id: ${t.id} -->`)
    );
    if (tweetsToAdd.length === 0) return;

    const newSections = tweetsToAdd
      .map((tweet) => {
        const author = authorMap[tweet.author_id];
        const quotedRef = tweet.referenced_tweets?.find(
          (r: any) => r.type === "quoted"
        );
        const quotedTweet = quotedRef ? quotedMap[quotedRef.id] : undefined;
        const quotedAuthor = quotedTweet
          ? authorMap[quotedTweet.author_id]
          : undefined;
        const repliedToRef = tweet.referenced_tweets?.find(
          (r: any) => r.type === "replied_to"
        );
        // Only show replied-to block if parent is NOT already in this date file
        const repliedToInSameConv = repliedToRef
          ? newTweets.some((t) => t.id === repliedToRef.id) ||
            existingContent.includes(`<!-- tweet-id: ${repliedToRef.id} -->`)
          : false;
        const repliedToTweet =
          repliedToRef && !repliedToInSameConv
            ? quotedMap[repliedToRef.id]
            : undefined;
        const repliedToAuthor = repliedToTweet
          ? authorMap[repliedToTweet.author_id]
          : undefined;
        return this.tweetSection(
          tweet,
          author,
          quotedTweet,
          quotedAuthor,
          repliedToTweet,
          repliedToAuthor
        );
      })
      .join("\n");

    const finalContent = existingContent
      ? existingContent + "\n" + newSections
      : `# ${date}\n\n${newSections}`;
    const encoded = btoa(unescape(encodeURIComponent(finalContent)));

    const body: any = {
      message: sha ? `Update ${date}` : `Add ${date}`,
      content: encoded
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok && res.status !== 422) {
      throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
    }
  }
}
