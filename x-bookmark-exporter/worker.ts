/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";

export interface Env {
  BookmarkExporter: DurableObjectNamespace<BookmarkExporter>;
  X_CLIENT_ID: string;
  X_CLIENT_SECRET: string;
}

async function generateRandomString(length: number): Promise<string> {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  //@ts-ignore
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface XBookmark {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: any;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const redirect_uri = `https://redirect.simplerauth.com/callback?redirect_to=${encodeURIComponent(url.origin + "/callback")}`;

    // OAuth callback handler
    if (url.pathname === "/callback") {
      const isLocalhost = url.hostname === "localhost";
      const securePart = isLocalhost ? "" : "Secure; ";
      const code = url.searchParams.get("code");
      const urlState = url.searchParams.get("state");

      // Parse cookies
      const cookie = request.headers.get("Cookie") || "";
      const cookies = cookie.split(";").map((c) => c.trim());
      const stateCookie = cookies
        .find((c) => c.startsWith("x_oauth_state="))
        ?.split("=")[1];
      const codeVerifier = cookies
        .find((c) => c.startsWith("x_code_verifier="))
        ?.split("=")[1];

      // Validate state and code verifier
      if (
        !urlState ||
        !stateCookie ||
        urlState !== stateCookie ||
        !codeVerifier
      ) {
        return new Response(
          `Invalid state or missing code verifier ${JSON.stringify({
            urlState,
            stateCookie,
            codeVerifier: !!codeVerifier,
          })}`,
          { status: 400 },
        );
      }

      if (!code) {
        return new Response("Missing authorization code", { status: 400 });
      }

      // Exchange code for token
      const tokenBody: Record<string, string> = {
        code,
        client_id: env.X_CLIENT_ID,
        grant_type: "authorization_code",
        redirect_uri,
        code_verifier: codeVerifier,
      };

      const tokenHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      // Only use Basic auth for confidential clients (with client secret)
      tokenHeaders["Authorization"] =
        `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`;

      const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: tokenHeaders,
        body: new URLSearchParams(tokenBody),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.log("Token exchange failed:", tokenResponse.status, errorText);
        // Clear temporary cookies on error
        const errorHeaders = new Headers({
          "Content-Type": "text/plain",
        });
        errorHeaders.append(
          "Set-Cookie",
          `x_oauth_state=; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=0`,
        );
        errorHeaders.append(
          "Set-Cookie",
          `x_code_verifier=; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=0`,
        );
        return new Response(`Failed to exchange token: ${errorText}`, {
          status: 500,
          headers: errorHeaders,
        });
      }

      const tokens = (await tokenResponse.json()) as any;

      // Get user ID
      const meResponse = await fetch("https://api.x.com/2/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const userData = (await meResponse.json()) as any;
      const userId = userData.data.id;
      console.log({ userId });
      // Initialize Durable Object for this user
      const id = env.BookmarkExporter.idFromName(userId);
      const stub = env.BookmarkExporter.get(id);
      console.log("tokens", tokens);

      await stub.initialize({
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });

      // Clear temporary cookies and set userId cookie, then redirect to dashboard
      const successHeaders = new Headers({
        Location: "/dashboard",
      });
      successHeaders.append(
        "Set-Cookie",
        `x_oauth_state=; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=0`,
      );
      successHeaders.append(
        "Set-Cookie",
        `x_code_verifier=; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=0`,
      );
      successHeaders.append(
        "Set-Cookie",
        `x_user_id=${userId}; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`,
      );

      return new Response("Redirecting to dashboard", {
        status: 302,
        headers: successHeaders,
      });
    }

    // Status API
    if (url.pathname.startsWith("/api/status/")) {
      const userId = url.pathname.split("/").pop()!;
      const id = env.BookmarkExporter.idFromName(userId);
      const stub = env.BookmarkExporter.get(id);
      const status = await stub.getStatus();
      return Response.json(status);
    }

    // Export API
    if (url.pathname.startsWith("/api/export/")) {
      const userId = url.pathname.split("/").pop()!;
      const id = env.BookmarkExporter.idFromName(userId);
      const stub = env.BookmarkExporter.get(id);
      const bookmarks = await stub.exportBookmarks();
      return Response.json(bookmarks);
    }

    // Dashboard
    if (url.pathname === "/dashboard") {
      // Get userId from cookie
      const cookie = request.headers.get("Cookie") || "";
      const cookies = cookie.split(";").map((c) => c.trim());
      const userId = cookies
        .find((c) => c.startsWith("x_user_id="))
        ?.split("=")[1];

      if (!userId) {
        return new Response("Redirecting to login", {
          status: 302,
          headers: { Location: "/" },
        });
      }

      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - X Bookmark Exporter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000;
      color: #e7e9ea;
      min-height: 100vh;
      padding: 24px;
    }
    .header {
      max-width: 550px;
      margin: 0 auto 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
    }
    .count {
      color: #71767b;
      font-size: 14px;
    }
    .tweets {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .tweet-container {
      width: 100%;
      max-width: 550px;
    }
    .empty {
      color: #71767b;
      padding: 40px 0;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Bookmarked Tweets</h1>
    <span class="count" id="count">Loading...</span>
  </div>
  <div class="tweets" id="tweets"></div>

  <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
  <script>
    const userId = '${userId}';

    async function load() {
      const res = await fetch('/api/export/' + userId);
      const bookmarks = await res.json();

      document.getElementById('count').textContent = bookmarks.length + ' bookmarks';

      const container = document.getElementById('tweets');
      if (bookmarks.length === 0) {
        container.innerHTML = '<div class="empty">No bookmarks yet</div>';
        return;
      }

      container.innerHTML = bookmarks.map(b => \`
        <div class="tweet-container">
          <blockquote class="twitter-tweet" data-theme="dark">
            <a href="https://twitter.com/x/status/\${b.id}"></a>
          </blockquote>
        </div>
      \`).join('');

      // Re-render Twitter widgets
      if (window.twttr && window.twttr.widgets) {
        twttr.widgets.load();
      }
    }

    load();
  </script>
</body>
</html>`,
        { headers: { "Content-Type": "text/html;charset=utf8" } },
      );
    }

    // OAuth initiation
    if (url.pathname === "/login") {
      const isLocalhost = url.hostname === "localhost";
      const securePart = isLocalhost ? "" : "Secure; ";

      const state = await generateRandomString(16);
      const codeVerifier = await generateRandomString(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const authUrl = new URL("https://x.com/i/oauth2/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", env.X_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirect_uri);
      authUrl.searchParams.set(
        "scope",
        "bookmark.read tweet.read users.read offline.access",
      );
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const headers = new Headers({
        Location: authUrl.toString(),
      });
      headers.append(
        "Set-Cookie",
        `x_oauth_state=${state}; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=600`,
      );
      headers.append(
        "Set-Cookie",
        `x_code_verifier=${codeVerifier}; HttpOnly; Path=/; ${securePart}SameSite=Lax; Max-Age=600`,
      );

      return new Response("Redirecting", { status: 307, headers });
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export class BookmarkExporter extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.initDatabase();
  }

  private initDatabase() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        text TEXT,
        created_at TEXT,
        author_id TEXT,
        public_metrics TEXT,
        synced_at INTEGER
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_created_at ON bookmarks(created_at DESC)
    `);
  }

  // ─── KV Helper Functions ───────────────────────────────────────────────

  private kv = {
    get: (key: string): string | null => {
      const result = this.sql
        .exec("SELECT value FROM kv WHERE key = ?", key)
        .toArray();
      return result.length > 0 ? (result[0].value as string) : null;
    },

    getJson: <T>(key: string): T | null => {
      const value = this.kv.get(key);
      return value ? JSON.parse(value) : null;
    },

    getNumber: (key: string): number | null => {
      const value = this.kv.get(key);
      return value !== null ? Number(value) : null;
    },

    getBool: (key: string): boolean => {
      return this.kv.get(key) === "true";
    },

    set: (key: string, value: string): void => {
      this.sql.exec(
        "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
        key,
        value,
      );
    },

    setJson: (key: string, value: unknown): void => {
      this.kv.set(key, JSON.stringify(value));
    },

    setNumber: (key: string, value: number): void => {
      this.kv.set(key, String(value));
    },

    setBool: (key: string, value: boolean): void => {
      this.kv.set(key, value ? "true" : "false");
    },

    delete: (key: string): void => {
      this.sql.exec("DELETE FROM kv WHERE key = ?", key);
    },

    has: (key: string): boolean => {
      const result = this.sql
        .exec("SELECT 1 FROM kv WHERE key = ?", key)
        .toArray();
      return result.length > 0;
    },

    keys: (): string[] => {
      return this.sql
        .exec("SELECT key FROM kv")
        .toArray()
        .map((row) => row.key as string);
    },
  };

  // ─── State Keys ────────────────────────────────────────────────────────

  private static readonly KEYS = {
    USER_ID: "userId",
    ACCESS_TOKEN: "accessToken",
    REFRESH_TOKEN: "refreshToken",
    LAST_SYNC_TIME: "lastSyncTime",
    NEXT_PAGINATION_TOKEN: "nextPaginationToken",
    IS_INITIAL_EXPORT: "isInitialExport",
    TOTAL_BOOKMARKS: "totalBookmarks",
    LAST_REQUEST_TIME: "lastRequestTime",
  } as const;

  async initialize(config: {
    userId: string;
    accessToken: string;
    refreshToken?: string;
  }) {
    const K = BookmarkExporter.KEYS;
    this.kv.set(K.USER_ID, config.userId);
    this.kv.set(K.ACCESS_TOKEN, config.accessToken);
    if (config.refreshToken) {
      this.kv.set(K.REFRESH_TOKEN, config.refreshToken);
    }
    this.kv.setBool(K.IS_INITIAL_EXPORT, true);
    this.kv.setNumber(K.TOTAL_BOOKMARKS, 0);

    try {
      await this.syncBookmarks();
    } catch (error) {
      console.error("Sync error:", error);
    }
    // Start sync alarm (every 15 minutes - respecting Free tier limit)
    await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
  }

  async alarm() {
    const K = BookmarkExporter.KEYS;

    // Check if initialized
    if (!this.kv.has(K.USER_ID)) return;

    // Check rate limit (15 min = 900000ms)
    const now = Date.now();
    const lastRequestTime = this.kv.getNumber(K.LAST_REQUEST_TIME);
    if (lastRequestTime && now - lastRequestTime < 900000) {
      // Too soon, reschedule
      await this.ctx.storage.setAlarm(lastRequestTime + 900000);
      return;
    }

    try {
      await this.syncBookmarks();
    } catch (error) {
      console.error("Sync error:", error);
    }

    // Schedule next sync (15 minutes)
    await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
  }

  private async refreshAccessToken(): Promise<boolean> {
    const K = BookmarkExporter.KEYS;
    const refreshToken = this.kv.get(K.REFRESH_TOKEN);

    if (!refreshToken) {
      console.log("No refresh token available");
      return false;
    }

    const tokenBody = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.env.X_CLIENT_ID,
    };

    const response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${this.env.X_CLIENT_ID}:${this.env.X_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams(tokenBody),
    });

    if (!response.ok) {
      console.log(
        "Token refresh failed:",
        response.status,
        await response.text(),
      );
      return false;
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    this.kv.set(K.ACCESS_TOKEN, tokens.access_token);
    if (tokens.refresh_token) {
      this.kv.set(K.REFRESH_TOKEN, tokens.refresh_token);
    }

    console.log("Access token refreshed successfully");
    return true;
  }

  private async syncBookmarks() {
    const K = BookmarkExporter.KEYS;

    const userId = this.kv.get(K.USER_ID);
    let accessToken = this.kv.get(K.ACCESS_TOKEN);
    if (!userId || !accessToken) return;

    const url = new URL(`https://api.x.com/2/users/${userId}/bookmarks`);
    url.searchParams.set("max_results", "90");
    url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics");

    const paginationToken = this.kv.get(K.NEXT_PAGINATION_TOKEN);
    if (paginationToken) {
      url.searchParams.set("pagination_token", paginationToken);
    }

    this.kv.setNumber(K.LAST_REQUEST_TIME, Date.now());

    let response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Handle expired token - attempt refresh and retry
    if (response.status === 401) {
      console.log("Access token expired, attempting refresh");
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        accessToken = this.kv.get(K.ACCESS_TOKEN);
        response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } else {
        throw new Error("Token refresh failed - user needs to re-authenticate");
      }
    }

    if (response.status === 429) {
      console.log("Rate limited, will retry in 15 minutes");
      return;
    }

    if (!response.ok) {
      console.log("bookmarks api error", await response.text());
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    console.log({ data, meta: data.meta });

    // Store bookmarks
    if (data.data && data.data.length > 0) {
      for (const bookmark of data.data) {
        this.sql.exec(
          `INSERT OR REPLACE INTO bookmarks (id, text, created_at, author_id, public_metrics, synced_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          bookmark.id,
          bookmark.text,
          bookmark.created_at,
          bookmark.author_id,
          JSON.stringify(bookmark.public_metrics || {}),
          Date.now(),
        );
      }

      const count = this.sql
        .exec("SELECT COUNT(*) as count FROM bookmarks")
        .toArray()[0].count as number;
      this.kv.setNumber(K.TOTAL_BOOKMARKS, count);
    }

    // Handle pagination
    if (data.meta?.next_token) {
      this.kv.set(K.NEXT_PAGINATION_TOKEN, data.meta.next_token);
    } else {
      // Initial export complete
      this.kv.setBool(K.IS_INITIAL_EXPORT, false);
      this.kv.delete(K.NEXT_PAGINATION_TOKEN);
    }

    this.kv.setNumber(K.LAST_SYNC_TIME, Date.now());
  }

  async getStatus() {
    const K = BookmarkExporter.KEYS;

    if (!this.kv.has(K.USER_ID)) {
      return { error: "Not initialized" };
    }

    // Get actual count from database instead of KV
    const countResult = this.sql
      .exec("SELECT COUNT(*) as count FROM bookmarks")
      .toArray();
    const totalBookmarks = (countResult[0]?.count as number) ?? 0;

    return {
      totalBookmarks,
      isInitialExport: this.kv.getBool(K.IS_INITIAL_EXPORT),
      lastSyncTime: this.kv.getNumber(K.LAST_SYNC_TIME),
      nextPaginationToken: this.kv.get(K.NEXT_PAGINATION_TOKEN),
    };
  }

  async exportBookmarks() {
    const bookmarks = this.sql
      .exec(
        `
      SELECT id, text, created_at, author_id, public_metrics
      FROM bookmarks
      ORDER BY created_at DESC
    `,
      )
      .toArray();

    return bookmarks.map((b) => ({
      ...b,
      public_metrics: JSON.parse(b.public_metrics as string),
    }));
  }
}
