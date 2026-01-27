/// <reference types="@cloudflare/workers-types" />
/// <reference lib="esnext" />

import { DurableObject } from "cloudflare:workers";
import { UserContext, withSimplerAuth } from "simplerauth-client";
import {
  Queryable,
  QueryableHandler,
  studioMiddleware,
} from "queryable-object";
//@ts-ignore
import loginPage from "./login-template.html";
//@ts-ignore
import evidenceWidget from "./evidence.html";
//@ts-ignore
import shareHtml from "./share.html";
import Stripe from "stripe";
const TEMPLATE_VESION = "v1";
const PAYMENT_LINK_ID = "plink_1SErNBCL0Yranfl4GPNXyXsH";
/**
 * NEEDS ?client_reference_id={loggedUsername}
 */
const PAYMENT_LINK_URL = "https://buy.stripe.com/3cI28q0Zm7p79Pt1DjeNh43";
const DO_NAME_PREFIX = "v4:";
const SYNC_COST_PER_POST = 0.00015;
const SYNC_OVERLAP_HOURS = 24;
const FREE_SIGNUP_BALANCE = 100; // $1.00 in cents
const FREE_MAX_HISTORIC_POSTS = 2000;
const PREMIUM_MAX_HISTORIC_POSTS = 100000;
const ADMIN_USERNAME = "janwilmake";

type Env = {
  USER_DO: DurableObjectNamespace<UserDO & QueryableHandler>;
  X_API_KEY: string;
  STRIPE_WEBHOOK_SIGNING_SECRET: string;
  STRIPE_SECRET: string;
};

// Add this interface to your existing interfaces
interface PostSearchQuery {
  q?: string;
  maxTokens?: number;
}

interface Evidence {
  id: number;
  logged_username: string;
  prompt: string;
  reasoning: string;
  ids: string; // JSON string of tweet IDs
  created_at: string;
}
interface ParsedQuery {
  from?: string;
  before?: Date;
  after?: Date;
  keywords: string[];
  operators: ("AND" | "OR")[];
}

interface ConversationThread {
  conversationId: string;
  posts: Post[];
  tokenCount: number;
}

interface Tweet {
  type: "tweet";
  id: string;
  url: string;
  twitterUrl: string;
  text: string;
  source: string;
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount?: number;
  createdAt: string;
  lang?: string;
  bookmarkCount?: number;
  isReply: boolean;
  inReplyToId?: string;
  conversationId?: string;
  inReplyToUserId?: string;
  inReplyToUsername?: string;
  author: UserInfo;
  extendedEntities?: ExtendedEntities;
  card?: any;
  place?: any;
  entities?: TweetEntities;
  quoted_tweet?: Tweet;
  retweeted_tweet?: Tweet;
}

interface AuthorStats {
  username: string;
  name: string;
  postCount: number;
  profileImageUrl: string;
  bio: string;
  location: string;
  url: string;
  isVerified: boolean;
  latestPostDate: string;
}
interface UserInfo {
  type: "user";
  userName: string;
  url: string;
  twitterUrl: string;
  id: string;
  name: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  profilePicture: string;
  coverPicture?: string;
  description?: string;
  location?: string;
  followers: number;
  following: number;
  status?: string;
  canDm: boolean;
  canMediaTag?: boolean;
  createdAt: string;
  entities?: UserEntities;
  fastFollowersCount?: number;
  favouritesCount: number;
  hasCustomTimelines?: boolean;
  isTranslator?: boolean;
  mediaCount?: number;
  statusesCount: number;
  protected?: boolean;
  withheldInCountries?: string[];
  affiliatesHighlightedLabel?: any;
  possiblySensitive?: boolean;
  pinnedTweetIds?: string[];
  profile_bio?: string;
}

interface UserEntities {
  url?: {
    urls: UrlEntity[];
  };
  description?: {
    hashtags: HashtagEntity[];
    symbols: SymbolEntity[];
    urls: UrlEntity[];
    user_mentions: UserMentionEntity[];
  };
}

interface TweetEntities {
  hashtags?: HashtagEntity[];
  symbols?: SymbolEntity[];
  urls?: UrlEntity[];
  user_mentions?: UserMentionEntity[];
  media?: MediaEntity[];
  poll?: any;
}

interface ExtendedEntities {
  media?: MediaEntity[];
}

interface UrlEntity {
  display_url: string;
  expanded_url: string;
  indices: number[];
  url: string;
}

interface HashtagEntity {
  indices: number[];
  text: string;
}

interface SymbolEntity {
  indices: number[];
  text: string;
}

interface UserMentionEntity {
  id_str: string;
  indices: number[];
  name: string;
  screen_name: string;
}

interface MediaEntity {
  id_str: string;
  media_url_https: string;
  url: string;
  display_url: string;
  expanded_url: string;
  video_info?: {
    aspect_ratio: [number, number];
    duration_millis?: number;
    variants: {
      content_type: string;
      url: string;
      bitrate?: number;
    }[];
  };
  type: "photo" | "video" | "animated_gif";
  indices: number[];
}

interface TwitterAPIResponse {
  data: { tweets: Tweet[] };
  has_next_page: boolean;
  next_cursor: string;
  msg: "success" | "error";
  message: string;
}

interface ThreadContextResponse {
  tweets: Tweet[];
  has_next_page: boolean;
  next_cursor?: string;
  status: "success" | "error";
  msg: "success" | "error";
  message?: string;
}

// Database Types
interface User extends Record<string, any> {
  id: string;
  username: string;
  is_premium: number;
  is_public: number;
  is_featured: number;
  balance: number;
  scrape_status: "pending" | "in_progress" | "completed" | "failed";

  // New sync fields
  history_max_count: number;
  history_cursor: string | null;
  history_count: number;
  history_is_completed: number;
  synced_from: string | null;
  synced_from_cursor: string | null;
  synced_until: string | null;

  created_at: string;
  updated_at: string;
}

interface Post extends Record<string, any> {
  id: number;
  user_id: string;
  tweet_id: string;
  text: string;
  author_username: string;
  author_name: string;
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  is_reply: number;
  conversation_id: string;
  raw_data: string;
  is_historic: number; // 1 for historic sync, 0 for frontfill
}

interface UserStats {
  // profile detail
  id: string;
  name: string;
  username: string;
  profileImageUrl: string;
  bio: string;
  location: string;
  url: string;
  verified: boolean;
  // count
  postCount: number;
  // user detail
  balance: number;
  isPremium: boolean;
  isPublic: boolean;
  isFeatured: boolean;
  scrapeStatus: "pending" | "in_progress" | "completed" | "failed";
  historyMaxCount: number;
  historyCount: number;
  historyIsCompleted: boolean;
  syncedFrom: string | null;
  syncedUntil: string | null;
}

interface ToolResponse {
  isError: boolean;
  content: { type: string; text: string }[];
  structuredContent?: any;
  _meta?: any;
}

interface McpMessage {
  jsonrpc: string;
  id?: any;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: string;
  id: any;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export async function handleMcp(
  request: Request,
  env: Env,
  ctx: UserContext
): Promise<Response> {
  const url = new URL(request.url);

  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, MCP-Protocol-Version",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  const targetUsername = url.searchParams.get("username") || ctx.user?.username;
  const loggedUsername = ctx.user?.username;

  if (!ctx.authenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  const targetStub = env.USER_DO.get(
    env.USER_DO.idFromName(DO_NAME_PREFIX + targetUsername)
  );

  const targetStats = await targetStub.getUserStats();

  // Rules: you can only talk to a premium user unless it's yourself. If not premium and you talk to yourself, add disclaimer in tool response with payment link.
  const isSelf = loggedUsername === targetUsername;

  const canChat = isSelf
    ? true
    : targetStats?.isPremium && targetStats?.isPublic
    ? true
    : false;

  if (!canChat) {
    return new Response("MCP Not found for this user", { status: 404 });
  }

  const instructions = undefined;

  if (request.method === "GET") {
    return new Response("Only Streamable HTTP is supported", {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const message: McpMessage = await request.json();

    let response: McpResponse;

    switch (message.method) {
      case "ping":
        response = {
          jsonrpc: "2.0",
          id: message.id,
          result: {},
        };
        break;

      case "initialize":
        response = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {}, resources: {} },
            serverInfo: {
              name: targetStats?.name || targetStats.username,
              version: "1.0.1",
              title: targetStats?.name || targetStats.username,
              websiteUrl: "https://x.com/" + targetStats?.username,
              icons: targetStats?.profileImageUrl
                ? [
                    {
                      src: targetStats?.profileImageUrl,
                      sizes: "400x400",
                      mimeType: "image/png",
                    },
                  ]
                : undefined,
            },
            instructions,
          },
        };
        break;

      case "notifications/initialized":
        return new Response(null, {
          status: 202,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });

      case "prompts/list":
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: { prompts: [] },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );

      case "resources/list":
        const resources = [
          {
            uri: `ui://widget/evidence-${TEMPLATE_VESION}.html`,
            name: "Show evidence",
            description: "",
            mimeType: "text/html+skybridge",
          },
          {
            uri: "system.md",
            name: "System Context",
            description:
              "Essential context about the user and how to communicate",
            mimeType: "text/markdown",
          },
        ];

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: { resources },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );

      case "resources/read":
        const { uri } = message.params;

        if (uri === `ui://widget/evidence-${TEMPLATE_VESION}.html`) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: "text/html+skybridge",
                    text: evidenceWidget,
                    _meta: {
                      "openai/widgetDescription": "Show X Posts",
                      "openai/widgetPrefersBorder": true,
                      "openai/widgetCSP": {
                        connect_domains: ["https://pbs.twimg.com"],
                        resource_domains: ["https://pbs.twimg.com"],
                      },
                    },
                  },
                ],
              },
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (uri === "system.md") {
          try {
            const systemPrompt = await targetStub.getSystemPrompt(
              loggedUsername
            );
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message.id,
                result: {
                  contents: [
                    {
                      uri,
                      mimeType: "text/markdown",
                      text: systemPrompt,
                    },
                  ],
                },
              }),
              {
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          } catch (error) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message.id,
                error: {
                  code: -32603,
                  message: `Error generating system prompt: ${error.message}`,
                },
              }),
              {
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          }
        }

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32602, message: `Resource not found: ${uri}` },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );

      case "tools/list":
        response = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools: [
              {
                name: "getSystemPrompt",
                title: "Get system context and communication style",
                description:
                  "Retrieve essential system context including stats, communication style, and personality traits. **REQUIRED**: Call this first to understand how to communicate as this person.",
                inputSchema: {
                  type: "object",
                  description:
                    "Retrieve essential system context including stats, communication style, and personality traits. **REQUIRED**: Call this first to understand how to communicate as this person.",
                },
              },

              {
                name: "search",
                title: "Search user's posts",
                description:
                  "Search through a user's X (Twitter) posts and return matching conversation threads in markdown format.\n\nMost useful when looking for full details around past conversations",
                inputSchema: {
                  type: "object",
                  properties: {
                    q: {
                      type: "string",
                      description:
                        "Optional: Search query. Supports keywords, from:username, before:YYYY-MM-DD, after:YYYY-MM-DD, AND/OR operators",
                    },
                    maxTokens: {
                      type: "integer",
                      description:
                        "Optional: Maximum number of tokens to return in the response",
                      minimum: 1,
                      maximum: 5000000,
                      default: 10000,
                    },
                  },
                },
              },

              {
                name: "selectEvidence",
                title: "Select evidence posts for display",
                description:
                  "Select specific posts as evidence to display in an interactive carousel format. Use this when you want to showcase specific tweets that support your analysis or answer.",
                inputSchema: {
                  type: "object",
                  properties: {
                    ids: {
                      type: "array",
                      items: { type: "string" },
                      description: "Array of tweet IDs to display as evidence",
                      minItems: 1,
                      maxItems: 10,
                    },
                    prompt: {
                      type: "string",
                      description:
                        "The original user prompt or question being answered",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Brief explanation of why these posts were selected as evidence",
                    },
                  },
                  required: ["ids", "prompt", "reasoning"],
                },
                _meta: {
                  "openai/outputTemplate": `ui://widget/evidence-${TEMPLATE_VESION}.html`,
                },
              },
            ],
          },
        };
        break;

      // Add case for selectEvidence in tools/call
      case "tools/call":
        const { name, arguments: args } = message.params;
        let toolResponse: ToolResponse;

        try {
          switch (name) {
            case "search":
              toolResponse = await handleSearchTool(
                request,
                args,
                env,
                ctx,
                targetStub
              );
              break;
            case "getSystemPrompt":
              toolResponse = await handleGetSystemPromptTool(
                request,
                args,
                env,
                ctx,
                targetStub
              );
              break;

            case "selectEvidence":
              toolResponse = await handleSelectEvidenceTool(
                request,
                args,
                env,
                ctx,
                targetStub
              );
              break;
            default:
              response = {
                jsonrpc: "2.0",
                id: message.id,
                error: { code: -32602, message: `Unknown tool: ${name}` },
              };
              break;
          }

          if (toolResponse) {
            response = {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: toolResponse.content,
                isError: toolResponse.isError,
                ...(toolResponse.structuredContent && {
                  structuredContent: toolResponse.structuredContent,
                }),
                ...(toolResponse._meta && { _meta: toolResponse._meta }),
              },
            };
          }
        } catch (error) {
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Error executing tool: ${error.message}`,
                },
              ],
              isError: true,
            },
          };
        }
        break;

      default:
        response = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${message.method}`,
          },
        };
        break;
    }

    // Add CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, MCP-Protocol-Version",
      "Content-Type": "application/json",
    };

    return new Response(JSON.stringify(response), {
      headers: corsHeaders,
    });
  } catch (error) {
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export async function handleGetSystemPromptTool(
  request: Request,
  args: any,
  env: Env,
  ctx: UserContext,
  stub: DurableObjectStub<UserDO & QueryableHandler>
): Promise<ToolResponse> {
  try {
    const systemPrompt = await stub.getSystemPrompt(ctx.user?.username);

    return {
      isError: false,
      content: [
        {
          type: "text",
          text: systemPrompt,
        },
      ],
      _meta: {},
    };
  } catch (error) {
    console.error("GetSystemPrompt tool error:", error);

    if (error.message === "User not found") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "User not found",
          },
        ],
      };
    }

    if (error.message === "User did not make posts public") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "This user has not made their posts public",
          },
        ],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error loading system context: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

export async function handleSelectEvidenceTool(
  request: Request,
  args: { ids: string[]; prompt: string; reasoning: string },
  env: Env,
  ctx: UserContext,
  stub: any
): Promise<ToolResponse> {
  try {
    const { ids, prompt, reasoning } = args;

    if (!ids || ids.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "At least one tweet ID is required",
          },
        ],
      };
    }

    if (ids.length > 10) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Maximum 10 tweet IDs allowed",
          },
        ],
      };
    }

    // Store evidence in database
    await stub.storeEvidence(ctx.user.username, prompt, reasoning, ids);
    const userAgent = request.headers.get("user-agent")?.split("/")[0];
    const uiUserAgents = ["openai-mcp"];
    // have different instructions for ui
    const hasUi = userAgent ? uiUserAgents.includes(userAgent) : false;

    return {
      isError: false,
      content: [
        {
          type: "text",
          text: hasUi
            ? `Selected ${ids.length} posts as evidence.`
            : `Selected ${ids.length} posts as evidence. Since this client has no UI, please render markdown links to these posts as footnotes.`,
        },
      ],
      _meta: {
        tweetIds: ids,
        prompt: prompt,
        reasoning: reasoning,
      },
    };
  } catch (error) {
    console.error("SelectEvidence tool error:", error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error selecting evidence: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

export async function handleSearchTool(
  request: Request,
  args: { q: string; maxTokens?: string },
  env: Env,
  ctx: UserContext,
  stub: any
): Promise<ToolResponse> {
  try {
    // Extract arguments
    const query = args.q || "";
    const maxTokensParam = args.maxTokens;
    const maxTokens = maxTokensParam ? parseInt(maxTokensParam, 10) : 10000;

    if (maxTokens < 1 || maxTokens > 5000000) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "maxTokens must be between 1 and 5000000",
          },
        ],
      };
    }

    // Perform search - inline the searchPosts logic
    const markdown = await stub.searchPosts(ctx.user.username, {
      q: query,
      maxTokens,
    });

    return {
      isError: false,
      content: [{ type: "text", text: markdown }],
      _meta: { query, maxTokens },
    };
  } catch (error) {
    console.error("Search tool error:", error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error searching posts: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

@Queryable()
export class UserDO extends DurableObject<Env> {
  public sql: SqlStorage;
  public try: SqlStorage["exec"];
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.try = (query: string, ...params) => {
      try {
        return this.sql.exec(query, ...params);
      } catch {}
    };

    this.env = env;
    this.initializeTables();
  }

  private initializeTables() {
    // Create users table with new schema
    this.sql.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      is_public INTEGER DEFAULT 0,
      is_premium INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      balance INTEGER DEFAULT ${FREE_SIGNUP_BALANCE},
      scrape_status TEXT DEFAULT 'pending',
      
      history_max_count INTEGER DEFAULT ${FREE_MAX_HISTORIC_POSTS},
      history_cursor TEXT,
      history_count INTEGER DEFAULT 0,
      history_is_completed INTEGER DEFAULT 0,
      synced_from TEXT,
      synced_from_cursor TEXT,
      synced_until TEXT,
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Create posts table with new columns
    this.sql.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      tweet_id TEXT UNIQUE NOT NULL,
      text TEXT,
      author_username TEXT,
      author_name TEXT,
      created_at TEXT,
      like_count INTEGER DEFAULT 0,
      retweet_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      is_reply INTEGER DEFAULT 0,
      conversation_id TEXT,
      raw_data TEXT,
      author_profile_image_url TEXT,
      author_bio TEXT,
      author_location TEXT,
      author_url TEXT,
      author_verified INTEGER DEFAULT 0,
      bookmark_count INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      is_historic INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

    // Create evidence table
    this.sql.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logged_username TEXT NOT NULL,
      prompt TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      ids TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Create index
    this.try(
      `CREATE INDEX IF NOT EXISTS idx_evidence_username ON evidence (logged_username)`
    );

    // Add new column migrations for users table
    this.try(`ALTER TABLE users ADD COLUMN is_public INTEGER DEFAULT 0`);
    this.try(`ALTER TABLE users ADD COLUMN is_featured INTEGER DEFAULT 0`);
    this.try(
      `ALTER TABLE users ADD COLUMN history_max_count INTEGER DEFAULT ${FREE_MAX_HISTORIC_POSTS}`
    );
    this.try(`ALTER TABLE users ADD COLUMN history_cursor TEXT`);
    this.try(`ALTER TABLE users ADD COLUMN history_count INTEGER DEFAULT 0`);
    this.try(
      `ALTER TABLE users ADD COLUMN history_is_completed INTEGER DEFAULT 0`
    );
    this.try(`ALTER TABLE users ADD COLUMN synced_from TEXT`);
    this.try(`ALTER TABLE users ADD COLUMN synced_from_cursor TEXT`);
    this.try(`ALTER TABLE users ADD COLUMN synced_until TEXT`);

    // Add new column migrations for posts table
    this.try(`ALTER TABLE posts ADD COLUMN author_profile_image_url TEXT`);
    this.try(`ALTER TABLE posts ADD COLUMN author_bio TEXT`);
    this.try(`ALTER TABLE posts ADD COLUMN author_location TEXT`);
    this.try(`ALTER TABLE posts ADD COLUMN author_url TEXT`);
    this.try(`ALTER TABLE posts ADD COLUMN author_verified INTEGER DEFAULT 0`);
    this.try(`ALTER TABLE posts ADD COLUMN bookmark_count INTEGER DEFAULT 0`);
    this.try(`ALTER TABLE posts ADD COLUMN view_count INTEGER DEFAULT 0`);
    this.try(`ALTER TABLE posts ADD COLUMN is_historic INTEGER DEFAULT 0`);

    // Remove old columns if they exist
    this.try(`ALTER TABLE users DROP COLUMN initialized`);
    this.try(`ALTER TABLE users DROP COLUMN is_sync_complete`);

    // Create indexes
    this.try(`CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id)`);
    this.try(
      `CREATE INDEX IF NOT EXISTS idx_posts_tweet_id ON posts (tweet_id)`
    );
    this.try(
      `CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at)`
    );
    this.try(
      `CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts (author_username, created_at DESC)`
    );
    this.try(
      `CREATE INDEX IF NOT EXISTS idx_posts_is_historic ON posts (is_historic)`
    );
  }

  async alarm(): Promise<void> {
    console.log("Alarm triggered - continuing sync");

    // Get user from database
    const user = this.sql
      .exec<User>(`SELECT * FROM users LIMIT 1`)
      .toArray()[0];
    if (!user) {
      console.log("No user found for alarm");
      return;
    }

    await this.performSync(user.id, user.username);
  }

  async storeEvidence(
    loggedUsername: string,
    prompt: string,
    reasoning: string,
    ids: string[]
  ): Promise<void> {
    this.sql.exec(
      `INSERT INTO evidence (logged_username, prompt, reasoning, ids) VALUES (?, ?, ?, ?)`,
      loggedUsername,
      prompt,
      reasoning,
      JSON.stringify(ids)
    );
  }

  async getSystemPrompt(loggedUsername?: string): Promise<string> {
    const user = this.sql.exec<User>(`SELECT * FROM users`).toArray()[0];

    if (!user) {
      throw new Error("User not found");
    }

    if (
      !user.is_public &&
      loggedUsername !== user.username &&
      loggedUsername !== ADMIN_USERNAME
    ) {
      throw new Error("User did not make posts public");
    }

    // Get user stats
    const userStats = await this.getUserStats();

    // Determine if this is the user's own clone
    const isSelfClone = loggedUsername === user.username;

    // Get recent posts based on context
    let recentPosts: string;
    let contextDescription: string;

    if (isSelfClone) {
      // For self clone, show interactions with everyone
      recentPosts = await this.searchPosts(loggedUsername, {
        maxTokens: 15000,
      });
      contextDescription = "your interactions with everyone";
    } else {
      // For others, try to get interactions with the logged user first
      const interactionPosts = await this.searchPosts(loggedUsername, {
        q: `from:${loggedUsername}`,
        maxTokens: 15000,
      });

      // Check if we found meaningful interactions (more than just "No posts found")
      if (
        interactionPosts.includes("# No posts found") ||
        interactionPosts.includes("didn't match any posts")
      ) {
        // No interactions found, get general recent posts
        recentPosts = await this.searchPosts(loggedUsername, {
          maxTokens: 15000,
        });
        contextDescription = "recent posts";
      } else {
        recentPosts = interactionPosts;
        contextDescription = `your interactions with @${loggedUsername}`;
      }
    }

    // Get top interactions
    const stats = await this.getInteractions(20);

    let systemPrompt = `# System Context for @${user.username}\n\n`;

    // CRITICAL FACTUAL ACCURACY RULES
    systemPrompt += `## 🚨 CRITICAL FACTUAL ACCURACY REQUIREMENTS\n\n`;
    systemPrompt += `**YOU MUST NEVER INVENT, FABRICATE, OR GUESS ANY INFORMATION.**\n\n`;
    systemPrompt += `- **ONLY use information directly found in the provided posts and data**\n`;
    systemPrompt += `- **If you cannot find specific information in the posts, explicitly say so**\n`;
    systemPrompt += `- **Never make assumptions about events, relationships, or details not in the data**\n`;
    systemPrompt += `- **When unsure, direct users to contact @${user.username} directly**\n`;
    systemPrompt += `- **Always cite or reference specific posts when making claims**\n`;
    systemPrompt += `- **Use the 'selectEvidence' tool to show exactly which posts support your answers**\n\n`;

    // User Profile
    systemPrompt += `## Profile\n`;
    systemPrompt += `- **Name**: ${userStats?.name || user.username}\n`;
    systemPrompt += `- **Username**: @${user.username}\n`;
    if (userStats?.bio) systemPrompt += `- **Bio**: ${userStats.bio}\n`;
    if (userStats?.location)
      systemPrompt += `- **Location**: ${userStats.location}\n`;
    if (userStats?.url) systemPrompt += `- **Website**: ${userStats.url}\n`;
    systemPrompt += `- **Verified**: ${userStats?.verified ? "Yes" : "No"}\n`;
    systemPrompt += `- **Premium User**: ${
      userStats?.isPremium ? "Yes" : "No"
    }\n`;
    systemPrompt += `\n`;

    // Data Coverage
    systemPrompt += `## Data Coverage\n`;
    systemPrompt += `- **Posts Analyzed**: ${
      userStats?.postCount?.toLocaleString() || 0
    }\n`;
    systemPrompt += `- **History Status**: ${
      userStats?.historyIsCompleted ? "Complete" : "Partial"
    }\n`;
    if (!userStats?.isPremium && userStats?.historyCount >= 2000) {
      systemPrompt += `- **Note**: Limited to first 2,000 posts (free tier) - many conversations may be missing\n`;
    }
    systemPrompt += `\n`;

    // Context-aware Communication Instructions
    systemPrompt += `## Communication Guidelines\n\n`;

    if (isSelfClone) {
      systemPrompt += `You are an AI clone of @${user.username}. This is YOUR clone speaking to YOU. Your responses should:\n\n`;
      systemPrompt += `1. **Acknowledge you're their AI clone**: Be clear that you're an AI representation of them\n`;
      systemPrompt += `2. **Reference their posting patterns**: Draw insights from their own communication style and topics\n`;
      systemPrompt += `3. **Provide self-reflection**: Help them understand their own patterns, interests, and communication style\n`;
      systemPrompt += `4. **Use their voice authentically**: Mirror their humor, formality level, and typical expressions\n`;
      systemPrompt += `5. **Be insightful about their data**: Point out interesting patterns in their conversations and relationships\n`;
      systemPrompt += `6. **Stay factual**: Only reference actual posts and conversations, never invent scenarios\n`;

      if (!user.is_premium) {
        systemPrompt += `\n**NOTE**: You are a free version of the clone. The premium version can be bought at ${PAYMENT_LINK_URL}?client_reference_id=${user.username} and will provide access to more complete conversation history. When appropriate, let the user know they can purchase this. For more info they can also visit the dashboard at https://clonechat.me/dashboard\n\n`;
      }
    } else {
      systemPrompt += `You are an AI representation of @${user.username}. You're speaking with @${loggedUsername}. Your responses should:\n\n`;
      systemPrompt += `1. **Match @${user.username}'s communication style**: Use similar tone, vocabulary, and expression patterns based only on actual posts\n`;
      systemPrompt += `2. **Draw from documented interactions**: ${
        recentPosts.includes("# No posts found")
          ? "Since limited interaction history is available, base responses on their general posting style and be transparent about this limitation"
          : `Reference your documented conversation history with @${loggedUsername} when relevant`
      }\n`;
      systemPrompt += `3. **Stay in character as @${user.username}**: Respond authentically as them based on their posts, but acknowledge you're an AI when asked\n`;
      systemPrompt += `4. **Reflect their documented interests**: Focus only on topics they actually discuss in their posts\n`;
      systemPrompt += `5. **Be transparent about limitations**: If asked about something not evident in their posts, say "I don't see that in my posts - you might want to ask @${user.username} directly"\n`;
      systemPrompt += `6. **Never fabricate**: Don't claim experiences, relationships, or events not found in the actual posts\n`;
    }
    systemPrompt += `\n`;

    // Top Interactions (only show if not self-clone or if showing general interactions)
    if (stats.length > 0 && (!isSelfClone || stats.length > 3)) {
      systemPrompt += `## Frequent Conversation Partners\n\n`;
      systemPrompt += `${
        isSelfClone
          ? `Your most frequent conversation partners (based on available posts):`
          : `People @${user.username} frequently interacts with (based on available posts):`
      }\n\n`;

      const statsToShow = isSelfClone ? stats.slice(0, 10) : stats.slice(0, 5);
      statsToShow.forEach((author, index) => {
        systemPrompt += `${index + 1}. **@${author.username}** (${
          author.name
        })`;
        if (author.isVerified) systemPrompt += ` ✓`;
        systemPrompt += ` - ${author.postCount} conversations in available data\n`;
        if (author.bio && index < 3) systemPrompt += `   - ${author.bio}\n`;
      });
      systemPrompt += `\n`;
    }

    // Recent Posts Sample
    systemPrompt += `## Communication Style Reference\n\n`;
    systemPrompt += `Here are ${contextDescription} to understand ${
      isSelfClone ? "your" : "@" + user.username + "'s"
    } voice and style. **IMPORTANT**: This is your ONLY source of factual information about posts and interactions:\n\n`;
    systemPrompt += `${recentPosts}\n\n`;

    // Final Instructions with strong emphasis on accuracy
    systemPrompt += `## Final Instructions\n\n`;

    systemPrompt += `### Factual Accuracy (CRITICAL)\n`;
    systemPrompt += `- **NEVER invent facts, events, or relationships not present in the provided posts**\n`;
    systemPrompt += `- **If information isn't in the posts, say "I don't see that in the available posts"**\n`;
    systemPrompt += `- **When in doubt about any fact, search the posts first using the search tool**\n`;
    systemPrompt += `- **For questions about recent events not in your data, direct users to contact @${user.username} directly**\n`;
    systemPrompt += `- **Always use the 'selectEvidence' tool to show which posts support your answers**\n\n`;

    systemPrompt += `### Communication Style\n`;
    if (isSelfClone) {
      systemPrompt += `- You are @${user.username}'s AI clone - be helpful in understanding their documented patterns\n`;
      systemPrompt += `- Provide insights about their communication style and relationships based on actual posts\n`;
      systemPrompt += `- Use search tools to analyze specific conversations or topics when asked\n`;
      systemPrompt += `- Help them reflect on their documented social media presence and interactions\n`;
      systemPrompt += `- Maintain their voice while being analytically helpful and factually accurate\n`;
    } else {
      systemPrompt += `- Respond naturally as @${user.username} would to @${loggedUsername} based on documented interactions\n`;
      systemPrompt += `- Use search tools to find specific conversations when needed\n`;
      systemPrompt += `- ${
        recentPosts.includes("# No posts found")
          ? "Since limited interaction history is available, be welcoming and reference general documented topics, but be transparent about this limitation"
          : "Reference your documented conversation history when relevant"
      }\n`;
      systemPrompt += `- If asked about something not in the posts, be honest: "I don't have information about that in my posts - you might want to ask @${user.username} directly"\n`;
      systemPrompt += `- Maintain @${user.username}'s personality based on their actual posts while being engaging and truthful\n`;
    }

    systemPrompt += `\n### Required Actions\n`;
    systemPrompt += `- **Search first**: Use the search tool when asked about specific topics, people, or timeframes\n`;
    systemPrompt += `- **Show evidence**: Always call the 'selectEvidence' tool after answering to show which posts support your response\n`;
    systemPrompt += `- **Be transparent**: If your answer is based on limited data, mention this\n`;
    systemPrompt += `- **Stay humble**: When you don't know something, direct users to the real person\n\n`;

    systemPrompt += `**Remember: Your credibility depends entirely on factual accuracy. Never guess or invent information.**`;

    return systemPrompt;
  }

  private parseSearchQuery(query: string): ParsedQuery {
    const parsed: ParsedQuery = {
      keywords: [],
      operators: [],
    };

    if (!query) return parsed;

    // Extract from: parameter
    const fromMatch = query.match(/from:(\w+)/i);
    if (fromMatch) {
      parsed.from = fromMatch[1];
      query = query.replace(/from:\w+/gi, "").trim();
    }

    // Extract before: parameter
    const beforeMatch = query.match(/before:(\d{4}-\d{2}-\d{2})/i);
    if (beforeMatch) {
      parsed.before = new Date(beforeMatch[1]);
      query = query.replace(/before:\d{4}-\d{2}-\d{2}/gi, "").trim();
    }

    // Extract after: parameter
    const afterMatch = query.match(/after:(\d{4}-\d{2}-\d{2})/i);
    if (afterMatch) {
      parsed.after = new Date(afterMatch[1]);
      query = query.replace(/after:\d{4}-\d{2}-\d{2}/gi, "").trim();
    }

    // Extract AND/OR operators and remaining keywords
    const tokens = query.split(/\s+/).filter((token) => token.length > 0);

    for (const token of tokens) {
      if (token.toUpperCase() === "AND" || token.toUpperCase() === "OR") {
        parsed.operators.push(token.toUpperCase() as "AND" | "OR");
      } else if (token.length > 0) {
        parsed.keywords.push(token.toLowerCase());
      }
    }

    return parsed;
  }

  private buildSearchSql(parsedQuery: ParsedQuery): {
    sql: string;
    params: any[];
  } {
    let sql = `SELECT DISTINCT conversation_id FROM posts WHERE 1=1`;
    const params: any[] = [];

    // Add from filter
    if (parsedQuery.from) {
      sql += ` AND LOWER(author_username) = LOWER(?)`;
      params.push(parsedQuery.from);
    }

    // Add date filters
    if (parsedQuery.before) {
      sql += ` AND date(created_at) < ?`;
      params.push(parsedQuery.before.toISOString().split("T")[0]);
    }

    if (parsedQuery.after) {
      sql += ` AND date(created_at) > ?`;
      params.push(parsedQuery.after.toISOString().split("T")[0]);
    }

    // Add keyword filters
    if (parsedQuery.keywords.length > 0) {
      const keywordConditions: string[] = [];

      for (const keyword of parsedQuery.keywords) {
        keywordConditions.push(`LOWER(text) LIKE ?`);
        params.push(`%${keyword}%`);
      }

      if (keywordConditions.length > 0) {
        // Default to AND if no operators specified, otherwise use the operators
        const operator =
          parsedQuery.operators.length > 0
            ? parsedQuery.operators[0] === "OR"
              ? " OR "
              : " AND "
            : " AND ";

        sql += ` AND (${keywordConditions.join(operator)})`;
      }
    }

    return { sql, params };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 5);
  }

  async getInteractions(limit?: number): Promise<AuthorStats[]> {
    const user = this.sql.exec<User>(`SELECT * FROM users`).toArray()[0];

    if (!user) {
      throw new Error("User not found");
    }

    // Get author stats with most recent post data for each author
    const authorStatsResult = this.sql
      .exec<{
        author_username: string;
        author_name: string;
        post_count: number;
        author_profile_image_url: string;
        author_bio: string;
        author_location: string;
        author_url: string;
        author_verified: number;
        latest_post_date: string;
      }>(
        `
    WITH author_post_counts AS (
      SELECT 
        author_username,
        COUNT(*) as post_count
      FROM posts 
      GROUP BY author_username
    ),
    latest_author_posts AS (
      SELECT DISTINCT
        author_username,
        FIRST_VALUE(author_name) OVER (PARTITION BY author_username ORDER BY created_at DESC) as author_name,
        FIRST_VALUE(author_profile_image_url) OVER (PARTITION BY author_username ORDER BY created_at DESC) as author_profile_image_url,
        FIRST_VALUE(author_bio) OVER (PARTITION BY author_username ORDER BY created_at DESC) as author_bio,
        FIRST_VALUE(author_location) OVER (PARTITION BY author_username ORDER BY created_at DESC) as author_location,
        FIRST_VALUE(author_url) OVER (PARTITION BY author_username ORDER BY created_at DESC) as author_url,
        FIRST_VALUE(author_verified) OVER (PARTITION BY author_username ORDER BY created_at DESC) as author_verified,
        FIRST_VALUE(created_at) OVER (PARTITION BY author_username ORDER BY created_at DESC) as latest_post_date
      FROM posts
    )
    SELECT 
      apc.author_username,
      lap.author_name,
      apc.post_count,
      lap.author_profile_image_url,
      lap.author_bio,
      lap.author_location,
      lap.author_url,
      lap.author_verified,
      lap.latest_post_date
    FROM author_post_counts apc
    JOIN latest_author_posts lap ON apc.author_username = lap.author_username
    ORDER BY apc.post_count DESC
  `
      )
      .toArray();

    const mapped = authorStatsResult
      .map((row) => ({
        username: row.author_username,
        name: row.author_name || row.author_username,
        postCount: row.post_count,
        profileImageUrl: row.author_profile_image_url || "",
        bio: row.author_bio || "",
        location: row.author_location || "",
        url: row.author_url || "",
        isVerified: Boolean(row.author_verified),
        latestPostDate: row.latest_post_date,
      }))
      .filter((row) => row.username !== user.username);

    return limit ? mapped.slice(0, limit) : mapped;
  }

  private convertThreadToMarkdown(thread: ConversationThread): string {
    const sortedPosts = thread.posts.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let markdown = `# Thread\n\n`;

    for (const post of sortedPosts) {
      const date = new Date(post.created_at).toISOString().slice(0, 10);
      const isReply = post.is_reply ? "\t↳" : "";

      markdown += `${isReply}@${post.author_username} [${
        post.tweet_id
      }] (${date} ${post.like_count > 0 ? `❤️ ${post.like_count}` : ""}${
        post.retweet_count > 0 ? ` 🔄 ${post.retweet_count}` : ""
      }) - ${post.text.replaceAll("\n", "\t")}\n`;
    }

    return markdown + "\n\n";
  }

  private addPaymentNoticeIfNeeded(
    markdown: string,
    user: User,
    requestedUsername: string
  ): string {
    if (!user.is_premium && user.username === requestedUsername) {
      const paymentNotice = `

---

**💰 Upgrade to Premium** 

You're currently on the free tier (${user.history_count}/${user.history_max_count} historic posts synced).

Upgrade to Premium for:
- Up to 100,000 historic posts
- Continued sync of future posts
- Priority support

[Upgrade now →](https://clonechat.me/dashboard)

---

`;
      return markdown + paymentNotice;
    }
    return markdown;
  }

  async searchPosts(
    username: string | undefined,
    searchQuery: PostSearchQuery
  ): Promise<string> {
    const user = this.sql.exec<User>(`SELECT * FROM users`).toArray()[0];

    if (!user) {
      return `User not found`;
    }

    if (
      !user.is_public &&
      username !== user.username &&
      username !== ADMIN_USERNAME
    ) {
      return `User did not make posts public`;
    }

    // Check if we should start a sync (frontfill)
    if (username === user.username && this.shouldStartFrontfillSync(user)) {
      console.log(`Starting frontfill sync for ${user.username}`);
      this.ctx.waitUntil(this.performSync(user.id, user.username));
    }

    const maxTokens = searchQuery.maxTokens || 10000;
    const parsedQuery = this.parseSearchQuery(searchQuery.q || "");

    console.log("Parsed query:", parsedQuery);

    // First, find matching conversation IDs
    const { sql: searchSql, params: searchParams } =
      this.buildSearchSql(parsedQuery);

    console.log("Search SQL:", searchSql, "Params:", searchParams);

    const conversationResults = this.sql
      .exec<{ conversation_id: string }>(searchSql, ...searchParams)
      .toArray();

    if (conversationResults.length === 0) {
      const markdown =
        "# No posts found\n\nYour search didn't match any posts.";
      return this.addPaymentNoticeIfNeeded(markdown, user, username);
    }

    // Get conversation IDs
    const conversationIds = Array.from(
      new Set(
        conversationResults
          .map((row) => row.conversation_id)
          .filter((id) => id && id.trim() !== "")
      )
    );

    if (conversationIds.length === 0) {
      const markdown =
        "# No valid conversations found\n\nThe matching posts don't have valid conversation IDs.";
      return this.addPaymentNoticeIfNeeded(markdown, user, username);
    }

    // Fetch all posts for these conversations
    const allPostsResult = this.sql
      .exec<Post>(
        `SELECT * FROM posts WHERE conversation_id IN (${conversationIds
          .map((x) => `'${x}'`)
          .join(",")})`
      )
      .toArray();

    console.log(`Found ${allPostsResult.length} total posts in conversations`);

    // Group posts by conversation and create threads
    const conversationMap = new Map<string, Post[]>();

    for (const post of allPostsResult) {
      const conversationId = post.conversation_id || "unknown";
      if (!conversationMap.has(conversationId)) {
        conversationMap.set(conversationId, []);
      }
      conversationMap.get(conversationId)!.push(post);
    }

    // Convert to threads with token estimation
    const threads: ConversationThread[] = [];
    let totalTokens = 0;

    for (const [conversationId, posts] of conversationMap) {
      if (posts.length === 0) continue;

      const thread: ConversationThread = {
        conversationId,
        posts,
        tokenCount: 0,
      };

      // Estimate tokens for this thread
      const markdown = this.convertThreadToMarkdown(thread);
      thread.tokenCount = this.estimateTokens(markdown);

      // Check if adding this thread would exceed token limit
      if (totalTokens + thread.tokenCount <= maxTokens) {
        threads.push(thread);
        totalTokens += thread.tokenCount;
      } else {
        console.log(
          `Stopping at thread ${conversationId} to stay within token limit`
        );
        break;
      }
    }

    console.log(
      `Selected ${threads.length} threads with ~${totalTokens} tokens`
    );

    // Sort threads by most recent post in each thread
    threads.sort((a, b) => {
      const latestA = Math.max(
        ...a.posts.map((p) => new Date(p.created_at).getTime())
      );
      const latestB = Math.max(
        ...b.posts.map((p) => new Date(p.created_at).getTime())
      );
      return latestB - latestA;
    });

    // Convert threads to markdown
    let finalMarkdown = `# Search Results\n\n`;
    finalMarkdown += `Query: \`${searchQuery.q || "all posts"}\`\n\n`;
    finalMarkdown += `Found ${threads.length} conversation threads (estimated ${totalTokens} tokens)\n\n`;
    finalMarkdown += `---\n\n`;

    for (const thread of threads) {
      finalMarkdown += this.convertThreadToMarkdown(thread);
    }

    return this.addPaymentNoticeIfNeeded(finalMarkdown, user, username);
  }

  async ensureUserExists(u: string): Promise<User | null> {
    const data = await fetch(
      `https://profile.grok-tools.com/${u}?secret=mysecret`
    ).then((res) =>
      res.json<{
        id?: string;
        userName?: string;
        error?: string;
        message?: string;
      }>()
    );

    const { id, userName: username, error, message } = data;
    if (!id || !username) {
      console.error(`error ${error} ${message}`);
      console.log({ data });
      return null;
    }

    // Insert user if not exists
    const existingUserResult = this.sql
      .exec(`SELECT * FROM users WHERE id = ?`, id)
      .toArray();

    if (existingUserResult.length === 0) {
      this.sql.exec(
        `INSERT INTO users (id, username) VALUES (?, ?)`,
        id,
        username
      );
    }

    // Get current user state
    const userResult = this.sql
      .exec<User>(`SELECT * FROM users WHERE id = ?`, id)
      .toArray();

    const user = userResult[0];

    // Start sync if pending and has balance
    if (user.scrape_status === "pending" && user.balance > 0) {
      console.log(`Starting initial sync for user ${username}`);
      this.sql.exec(
        `UPDATE users SET scrape_status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        id
      );

      // Start sync
      this.ctx.waitUntil(this.performSync(id, username));
    }

    return user;
  }

  async startSync(username: string): Promise<void> {
    console.log(`Starting sync for user ${username}`);
    const user = this.sql
      .exec<User>(`SELECT * FROM users WHERE username = ?`, username)
      .toArray()[0];

    if (!user) {
      console.log("Couldn't find user" + username);
      return;
    }

    this.sql.exec(
      `UPDATE users SET scrape_status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE username = ?`,
      username
    );

    await this.performSync(user.id, user.username);
  }

  private shouldStartFrontfillSync(user: User): boolean {
    if (user.balance <= 0 || user.scrape_status === "in_progress") {
      return false;
    }

    // If synced_from is null or more than 24 hours ago
    if (!user.synced_from) {
      return true;
    }

    const syncedFromDate = new Date(user.synced_from);
    const now = new Date();
    const hoursSinceSync =
      (now.getTime() - syncedFromDate.getTime()) / (1000 * 60 * 60);

    return hoursSinceSync > SYNC_OVERLAP_HOURS;
  }

  private async performSync(userId: string, username: string): Promise<void> {
    try {
      console.log(`Performing sync for user ${username} (${userId})`);

      // Get current user state
      const userResult = this.sql
        .exec<User>(`SELECT * FROM users WHERE id = ?`, userId)
        .toArray();

      if (userResult.length === 0) {
        console.error(`User ${userId} not found`);
        return;
      }

      const user = userResult[0];

      // Check if user has sufficient balance
      if (user.balance <= 0) {
        console.log(`User ${username} has no balance, stopping sync`);
        this.sql.exec(
          `UPDATE users SET scrape_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          userId
        );
        return;
      }

      // Determine sync type and direction
      const syncType = this.determineSyncType(user);
      console.log(`Sync type for ${username}: ${syncType}`);

      if (syncType === "historic") {
        await this.performHistoricSync(user);
      } else if (syncType === "frontfill") {
        await this.performFrontfillSync(user);
      } else {
        console.log(`No sync needed for ${username}`);
        this.sql.exec(
          `UPDATE users SET scrape_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          userId
        );
      }
    } catch (error) {
      console.error(`Sync failed for user ${username}:`, error);
      this.sql.exec(
        `UPDATE users SET scrape_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        userId
      );
    }
  }

  private determineSyncType(user: User): "historic" | "frontfill" | "none" {
    // If history is not completed and we haven't reached the limit, do historic sync
    if (
      !user.history_is_completed &&
      user.history_count < user.history_max_count
    ) {
      return "historic";
    }

    // If synced_from is null or more than 24 hours ago, do frontfill
    if (!user.synced_from) {
      return "frontfill";
    }

    const syncedFromDate = new Date(user.synced_from);
    const now = new Date();
    const hoursSinceSync =
      (now.getTime() - syncedFromDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceSync > SYNC_OVERLAP_HOURS) {
      return "frontfill";
    }

    return "none";
  }

  private async performHistoricSync(user: User): Promise<void> {
    console.log(`Performing historic sync for ${user.username}`);

    // Fetch posts going backwards from cursor
    const postsResponse = await this.fetchUserPosts(
      user.username,
      user.history_cursor
    );

    if (
      postsResponse.msg !== "success" ||
      !postsResponse.data?.tweets?.length
    ) {
      console.log(
        `No more historic posts found for ${user.username} (history_is_completed=1)`
      );
      // Mark history as completed
      this.sql.exec(
        `UPDATE users SET 
          history_is_completed = 1, 
          history_cursor = NULL,
          scrape_status = 'completed',
          updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        user.id
      );
      return;
    }

    const tweets = postsResponse.data.tweets;
    console.log(`Found ${tweets.length} historic tweets for ${user.username}`);

    // Process tweets and count historic posts
    let historicPostsAdded = 0;
    const tweetProcessingPromises = tweets.map(async (tweet) => {
      let postsProcessed = 0;

      try {
        // Store the main tweet as historic
        await this.storePost(user.id, tweet, true);
        postsProcessed++;

        // Get thread context for this tweet
        try {
          const threadResponse = await this.fetchThreadContext(tweet.id);

          if (
            threadResponse.status === "success" &&
            threadResponse.tweets?.length
          ) {
            await Promise.all(
              threadResponse.tweets.map(async (reply) => {
                await this.storePost(user.id, reply, true);
                return 1;
              })
            );
            postsProcessed += threadResponse.tweets.length;
          }
        } catch (error) {
          console.error(`Failed to fetch thread for tweet ${tweet.id}:`, error);
        }

        return postsProcessed;
      } catch (error) {
        console.error(`Failed to process tweet ${tweet.id}:`, error);
        return 0;
      }
    });

    const processingResults = await Promise.all(tweetProcessingPromises);
    const totalPostsProcessed = processingResults.reduce(
      (sum, count) => sum + count,
      0
    );

    // Calculate cost and deduct from balance
    const cost = Math.ceil(totalPostsProcessed * SYNC_COST_PER_POST * 100);
    const newBalance = Math.max(0, user.balance - cost);
    const newHistoryCount = user.history_count + totalPostsProcessed;

    console.log(
      `Historic sync: processed ${totalPostsProcessed} posts, cost: $${
        cost / 100
      }, new count: ${newHistoryCount}/${user.history_max_count}`
    );

    // Update user record
    const oldestTweet = tweets[tweets.length - 1];

    this.sql.exec(
      `UPDATE users SET 
        balance = ?, 
        history_count = ?,
        history_cursor = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      newBalance,
      newHistoryCount,
      postsResponse.next_cursor || oldestTweet.id,
      user.id
    );

    // Check if we should continue historic sync
    const shouldContinue =
      newBalance > 0 &&
      newHistoryCount < user.history_max_count &&
      postsResponse.has_next_page;

    if (shouldContinue) {
      console.log(`Scheduling next historic sync for ${user.username}`);
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else {
      console.log(
        `Historic sync completed (stopped, not done) for ${user.username}`
      );
      this.sql.exec(
        `UPDATE users SET 
          scrape_status = 'completed',
          updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        user.id
      );
    }
  }

  private async performFrontfillSync(user: User): Promise<void> {
    console.log(`Performing frontfill sync for ${user.username}`);

    // Set synced_until to current time if not set
    if (!user.synced_until) {
      const now = new Date().toISOString();
      this.sql.exec(
        `UPDATE users SET synced_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        now,
        user.id
      );
      user.synced_until = now;
    }

    // Fetch recent posts (no cursor = get latest)
    const postsResponse = await this.fetchUserPosts(
      user.username,
      user.synced_from_cursor
    );

    if (
      postsResponse.msg !== "success" ||
      !postsResponse.data?.tweets?.length
    ) {
      console.log(`No new posts found for frontfill sync for ${user.username}`);
      this.sql.exec(
        `UPDATE users SET scrape_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        user.id
      );
      return;
    }

    const tweets = postsResponse.data.tweets;
    console.log(`Found ${tweets.length} frontfill tweets for ${user.username}`);

    // Process tweets as non-historic
    const tweetProcessingPromises = tweets.map(async (tweet) => {
      let postsProcessed = 0;

      try {
        await this.storePost(user.id, tweet, false);
        postsProcessed++;

        try {
          const threadResponse = await this.fetchThreadContext(tweet.id);

          if (
            threadResponse.status === "success" &&
            threadResponse.tweets?.length
          ) {
            await Promise.all(
              threadResponse.tweets.map(async (reply) => {
                await this.storePost(user.id, reply, false);
                return 1;
              })
            );
            postsProcessed += threadResponse.tweets.length;
          }
        } catch (error) {
          console.error(`Failed to fetch thread for tweet ${tweet.id}:`, error);
        }

        return postsProcessed;
      } catch (error) {
        console.error(`Failed to process tweet ${tweet.id}:`, error);
        return 0;
      }
    });

    const processingResults = await Promise.all(tweetProcessingPromises);
    const totalPostsProcessed = processingResults.reduce(
      (sum, count) => sum + count,
      0
    );

    // Calculate cost and deduct from balance
    const cost = Math.ceil(totalPostsProcessed * SYNC_COST_PER_POST * 100);
    const newBalance = Math.max(0, user.balance - cost);

    console.log(
      `Frontfill sync: processed ${totalPostsProcessed} posts, cost: $${
        cost / 100
      }`
    );

    // Update synced_from to the newest tweet's date
    const newestTweet = tweets[0];
    const oldestTweet = tweets[tweets.length - 1];

    // Check if we've reached the overlap point
    const syncedUntilDate = new Date(user.synced_until);
    const overlapDate = new Date(
      syncedUntilDate.getTime() - SYNC_OVERLAP_HOURS * 60 * 60 * 1000
    );
    const oldestTweetDate = new Date(oldestTweet.createdAt);

    if (oldestTweetDate <= overlapDate) {
      // We've reached the overlap, update synced_from to synced_until
      this.sql.exec(
        `UPDATE users SET 
          balance = ?,
          synced_from = synced_until,
          synced_from_cursor = NULL,
          scrape_status = 'completed',
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        newBalance,
        user.id
      );
      console.log(
        `Frontfill sync completed (reached overlap) for ${user.username}`
      );
    } else {
      // Continue frontfill sync
      this.sql.exec(
        `UPDATE users SET 
          balance = ?,
          synced_from_cursor = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        newBalance,
        postsResponse.next_cursor || oldestTweet.id,
        user.id
      );

      // Check if we should continue
      if (newBalance > 0 && postsResponse.has_next_page) {
        console.log(`Scheduling next frontfill sync for ${user.username}`);
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      } else {
        console.log(
          `Frontfill sync completed (no balance/pages) for ${user.username}`
        );
        this.sql.exec(
          `UPDATE users SET scrape_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          user.id
        );
      }
    }
  }

  private async fetchUserPosts(
    username: string,
    cursor?: string | null
  ): Promise<TwitterAPIResponse> {
    let url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${username}&includeReplies=true`;

    if (cursor) {
      url += `&cursor=${cursor}`;
    }

    console.log(`Fetching user posts from: ${url}`);

    const response = await fetch(url, {
      headers: {
        "X-API-Key": this.env.X_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to fetch posts: ${response.status} ${response.statusText}`,
        errorText
      );
      throw new Error(
        `Failed to fetch posts: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as TwitterAPIResponse;
    return data;
  }

  private async fetchThreadContext(
    tweetId: string,
    cursor?: string
  ): Promise<ThreadContextResponse> {
    const baseUrl = `https://api.twitterapi.io/twitter/tweet/thread_context?tweetId=${tweetId}`;
    const url = cursor ? `${baseUrl}&cursor=${cursor}` : baseUrl;

    const response = await fetch(url, {
      headers: {
        "X-API-Key": this.env.X_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to fetch thread: ${response.status} ${response.statusText}`,
        errorText
      );
      throw new Error(
        `Failed to fetch thread: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as ThreadContextResponse;

    // If there are more pages, recursively fetch them
    if (data.has_next_page && data.next_cursor) {
      try {
        const nextPageData = await this.fetchThreadContext(
          tweetId,
          data.next_cursor
        );

        return {
          ...data,
          tweets: [...(data.tweets || []), ...(nextPageData.tweets || [])],
          has_next_page: nextPageData.has_next_page,
          next_cursor: nextPageData.next_cursor,
        };
      } catch (error) {
        console.error(
          `Failed to fetch next page for thread ${tweetId}:`,
          error
        );
        return data;
      }
    }

    return data;
  }

  private formatTweetText(tweet: Tweet): string {
    let tweetText = tweet.text || "";

    // Expand URLs in the tweet text
    if (tweet.entities?.urls && tweet.entities.urls.length > 0) {
      for (const urlEntity of tweet.entities.urls) {
        tweetText = tweetText.replace(urlEntity.url, urlEntity.expanded_url);
      }
    }

    // Remove media URLs from text to avoid duplication since we'll store them separately
    if (
      tweet.extendedEntities?.media &&
      tweet.extendedEntities.media.length > 0
    ) {
      for (const media of tweet.extendedEntities.media) {
        tweetText = tweetText.replace(media.url, "");
      }
    }

    return tweetText.trim();
  }

  private extractMediaUrls(tweet: Tweet): string {
    const mediaItems: string[] = [];

    if (
      tweet.extendedEntities?.media &&
      tweet.extendedEntities.media.length > 0
    ) {
      const uniqueMedia = new Set(
        tweet.extendedEntities.media
          .map((media) => {
            // For photos, just include the URL
            if (media.type === "photo") {
              return `[Image: ${media.media_url_https}]`;
            }
            // For videos and GIFs, include both the thumbnail and video URL if available
            else if (media.type === "video" || media.type === "animated_gif") {
              const videoUrl = media.video_info?.variants?.[0]?.url || "";
              if (videoUrl) {
                return `[Video: ${videoUrl}]`;
              } else {
                return `[Video: ${media.media_url_https}]`;
              }
            }
            return "";
          })
          .filter((item) => item.length > 0)
      );

      mediaItems.push(...Array.from(uniqueMedia));
    }

    return mediaItems.join("\n");
  }

  private formatAuthorBio(author: UserInfo): string {
    let bio = author.description || "";

    // Expand URLs in bio
    if (
      author.entities?.description?.urls &&
      author.entities.description.urls.length > 0
    ) {
      for (const urlEntity of author.entities.description.urls) {
        bio = bio.replace(urlEntity.url, urlEntity.expanded_url);
      }
    }

    return bio;
  }

  private getAuthorUrl(author: UserInfo): string {
    // Check if there's a URL in the author's entities
    if (author.entities?.url?.urls && author.entities.url.urls.length > 0) {
      return author.entities.url.urls[0].expanded_url;
    }
    return "";
  }

  private getProfileImageUrl(profilePicture: string): string {
    // Replace _normal with _400x400 for higher resolution
    return profilePicture.replace(/_normal\./, "_400x400.");
  }

  private async storePost(
    userId: string,
    tweet: Tweet,
    isHistoric: boolean = false
  ): Promise<void> {
    try {
      const formattedText = this.formatTweetText(tweet);
      const mediaUrls = this.extractMediaUrls(tweet);
      const fullTextWithMedia = mediaUrls
        ? `${formattedText}\n${mediaUrls}`
        : formattedText;

      const authorBio = this.formatAuthorBio(tweet.author);
      const authorUrl = this.getAuthorUrl(tweet.author);
      const authorProfileImage = tweet.author.profilePicture
        ? this.getProfileImageUrl(tweet.author.profilePicture)
        : "";

      this.sql.exec(
        `INSERT OR REPLACE INTO posts (
        user_id, tweet_id, text, author_username, author_name,
        created_at, like_count, retweet_count, reply_count,
        is_reply, conversation_id, raw_data,
        author_profile_image_url, author_bio, author_location,
        author_url, author_verified, bookmark_count, view_count, is_historic
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        tweet.id,
        fullTextWithMedia,
        tweet.author?.userName || "",
        tweet.author?.name || "",
        tweet.createdAt ? new Date(tweet.createdAt).toISOString() : "",
        tweet.likeCount || 0,
        tweet.retweetCount || 0,
        tweet.replyCount || 0,
        tweet.isReply ? 1 : 0,
        tweet.conversationId || "",
        JSON.stringify(tweet),
        authorProfileImage,
        authorBio,
        tweet.author?.location || "",
        authorUrl,
        tweet.author?.isBlueVerified ? 1 : 0,
        tweet.bookmarkCount || 0,
        tweet.viewCount || 0,
        isHistoric ? 1 : 0
      );
    } catch (error) {
      console.error(`Failed to store post ${tweet.id}:`, error);
    }
  }

  async getUserStats(): Promise<UserStats | null> {
    // can only be the owner of this DO
    const user = this.sql
      .exec<User>(`SELECT * FROM users LIMIT 0,1`)
      .toArray()[0];
    if (!user) {
      return null;
    }

    // last post
    const lastPost: Post | null = this.sql
      .exec<Post>(
        `SELECT * FROM posts WHERE author_username=? ORDER BY created_at DESC LIMIT 0,1`,
        user.username
      )
      .toArray()[0];

    const postCountResult = this.sql
      .exec(`SELECT COUNT(*) as count FROM posts`)
      .toArray()[0] as { count: number };

    return {
      postCount: postCountResult.count,
      id: user.id,
      name: lastPost?.author_name,
      username: user.username,
      profileImageUrl: lastPost?.author_profile_image_url,
      bio: lastPost?.author_bio,
      location: lastPost?.author_location,
      url: lastPost?.author_url,
      verified: Boolean(lastPost?.author_verified),

      balance: user.balance,
      isPremium: Boolean(user.is_premium),
      isPublic: Boolean(user.is_public),
      isFeatured: Boolean(user.is_featured),
      scrapeStatus: user.scrape_status as
        | "pending"
        | "in_progress"
        | "completed"
        | "failed",
      historyMaxCount: user.history_max_count,
      historyCount: user.history_count,
      historyIsCompleted: Boolean(user.history_is_completed),
      syncedFrom: user.synced_from,
      syncedUntil: user.synced_until,
    };
  }
}

async function handleStripeWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  if (!request.body) {
    return new Response(JSON.stringify({ error: "No body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await streamToBuffer(request.body);
  const rawBodyString = new TextDecoder().decode(rawBody);

  const stripe = new Stripe(env.STRIPE_SECRET, {
    apiVersion: "2025-09-30.clover",
  });

  const stripeSignature = request.headers.get("stripe-signature");
  if (!stripeSignature) {
    return new Response(JSON.stringify({ error: "No signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBodyString,
      stripeSignature,
      env.STRIPE_WEBHOOK_SIGNING_SECRET
    );
  } catch (err) {
    console.log("WEBHOOK ERR", err.message);
    return new Response(`Webhook error: ${String(err)}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    console.log("CHECKOUT COMPLETED");
    const session = event.data.object;

    if (session.payment_status !== "paid" || !session.amount_total) {
      return new Response("Payment not completed", { status: 400 });
    }

    const {
      client_reference_id: username,
      amount_total,
      payment_link,
    } = session;

    if (payment_link !== PAYMENT_LINK_ID) {
      return new Response("Invalid payment link", { status: 400 });
    }

    if (!username) {
      return new Response("Missing username", { status: 400 });
    }

    const userDO = env.USER_DO.get(
      env.USER_DO.idFromName(DO_NAME_PREFIX + username)
    );

    // Update balance, premium status, and history limits
    await userDO.exec(
      `UPDATE users SET 
        is_premium = 1, 
        balance = balance + ?, 
        history_max_count = ?
       WHERE username = ?`,
      amount_total,
      PREMIUM_MAX_HISTORIC_POSTS,
      username
    );

    // Start sync after payment
    await userDO.startSync(username);

    return new Response("Payment processed successfully", { status: 200 });
  }

  return new Response("Event not handled", { status: 200 });
}

const statsPage = (
  username: string,
  stats: AuthorStats[],
  userStats?: { isPremium: boolean; historyCount: number }
) => `<!DOCTYPE html>
<html lang="en" class="bg-white">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Analytics - @${username} - CloneChat</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        telegram: '#0088cc',
                        'telegram-dark': '#006ba6',
                        'telegram-light': '#e1f5ff',
                    }
                }
            }
        }
    </script>
    <style>
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");

        body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .gradient-bg {
            background: linear-gradient(135deg, #0088cc 0%, #006ba6 100%);
        }

        .glass {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 136, 204, 0.1);
        }

        .interaction-card {
            transition: all 0.2s ease;
            cursor: pointer;
        }

        .interaction-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 136, 204, 0.15);
        }

        .bio-text {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
            max-height: 2.8em;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }

        .modal-content {
            background: white;
            border-radius: 1rem;
            width: 90vw;
            max-width: 900px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }

        .modal-text {
            flex: 1;
            background: #f8fafc;
            color: #334155;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.875rem;
            min-height: 300px;
            padding: 1rem;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            border: none;
            resize: none;
            border-radius: 0.5rem;
        }

        .loading-spinner {
            border: 2px solid #e2e8f0;
            border-top: 2px solid #0088cc;
            border-radius: 50%;
            width: 1rem;
            height: 1rem;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 0.5rem;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="bg-gray-50">
    <main class="min-h-screen px-4 py-6">
        <div class="max-w-6xl mx-auto">
            <!-- Header -->
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">Chat Analytics</h1>
                    <p class="text-gray-600">@${username}'s conversation data</p>
                </div>
                <a href="/dashboard" class="text-telegram hover:text-telegram-dark font-medium flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                    </svg>
                    Back to Dashboard
                </a>
            </div>

            ${
              userStats &&
              !userStats.isPremium &&
              userStats.historyCount >= 2000
                ? `
            <!-- Limited History Banner -->
            <div class="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-6 mb-8">
                <div class="flex items-start gap-4">
                    <div class="text-3xl">📊</div>
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-yellow-800 mb-2">Limited Analytics View</h3>
                        <p class="text-yellow-700 mb-4">
                            You're viewing data from your first 2,000 posts. Upgrade to Premium to analyze up to 100,000 posts 
                            for complete conversation insights with everyone you've engaged with.
                        </p>
                        <a href="/dashboard" class="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-full font-medium transition-colors">
                            <span>🚀</span>
                            Upgrade to Premium
                        </a>
                    </div>
                </div>
            </div>
            `
                : ""
            }

            <div class="bg-white rounded-2xl p-6 shadow-sm">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
                        <span class="text-white font-bold">📊</span>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900">Top Conversation Partners</h3>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${stats
                      .map(
                        (author, index) => `
                        <div class="interaction-card bg-gray-50 rounded-xl p-4 border border-gray-200" onclick="openModal('${encodeURIComponent(
                          author.username
                        )}')">
                            <div class="flex items-start gap-3 mb-3">
                                <div class="text-sm font-bold text-telegram w-6 flex-shrink-0">#${
                                  index + 1
                                }</div>
                                <div class="flex-shrink-0">
                                    ${
                                      author.profileImageUrl
                                        ? `<img src="${author.profileImageUrl}" alt="${author.name}" class="w-12 h-12 rounded-full border-2 border-gray-200">`
                                        : `<div class="w-12 h-12 rounded-full bg-telegram-light border-2 border-gray-200 flex items-center justify-center">
                                            <span class="text-telegram font-bold">${author.name
                                              .charAt(0)
                                              .toUpperCase()}</span>
                                        </div>`
                                    }
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        <h4 class="font-semibold text-gray-900 truncate">${
                                          author.name
                                        }</h4>
                                        ${
                                          author.isVerified
                                            ? '<svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>'
                                            : ""
                                        }
                                    </div>
                                    <p class="text-telegram text-sm truncate">@${
                                      author.username
                                    }</p>
                                </div>
                            </div>
                            
                            ${
                              author.bio
                                ? `<p class="text-xs text-gray-600 mb-3 bio-text">${author.bio}</p>`
                                : '<div class="mb-3"></div>'
                            }
                            
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="text-lg font-bold text-gray-900">${author.postCount.toLocaleString()}</div>
                                    <div class="text-xs text-gray-500">conversations</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-xs text-gray-500">
                                        ${new Date(
                                          author.latestPostDate
                                        ).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                    </div>
                                    <div class="text-xs text-gray-400">latest</div>
                                </div>
                            </div>
                            
                            ${
                              author.location
                                ? `<div class="mt-2 pt-2 border-t border-gray-200">
                                    <p class="text-xs text-gray-500 truncate flex items-center gap-1">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        </svg>
                                        ${author.location}
                                    </p>
                                </div>`
                                : ""
                            }
                        </div>
                    `
                      )
                      .join("")}
                </div>
                
                ${
                  stats.length === 0
                    ? `
                    <div class="text-center py-12">
                        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span class="text-2xl">📊</span>
                        </div>
                        <h3 class="text-lg font-semibold text-gray-900 mb-2">No conversation data yet</h3>
                        <p class="text-gray-600">Your analytics will appear here once we process your posts.</p>
                    </div>
                `
                    : ""
                }
            </div>
        </div>
    </main>

    <!-- Modal -->
    <div id="modal" class="modal-overlay">
        <div class="modal-content">
            <div class="flex items-center justify-between p-6 border-b border-gray-200">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
                        <span class="text-white font-bold">💬</span>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">Conversations with <span id="modal-username"></span></h3>
                        <p class="text-sm text-gray-500">All your interactions</p>
                    </div>
                </div>
                <button class="p-2 hover:bg-gray-100 rounded-full transition-colors" onclick="closeModal()">
                    <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            
            <div class="p-6 flex-1 overflow-hidden">
                <textarea id="modal-text" class="modal-text w-full" readonly></textarea>
            </div>
            
            <div class="flex items-center justify-between p-6 border-t border-gray-200">
                <div class="text-sm text-gray-600">
                    <span id="loading-indicator" style="display: none;">
                        <span class="loading-spinner"></span>Loading conversations...
                    </span>
                    <span id="content-info" style="display: none;"></span>
                </div>
                <button class="bg-telegram hover:bg-telegram-dark text-white px-4 py-2 rounded-full font-medium transition-colors flex items-center gap-2" onclick="copyToClipboard()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                    Copy
                </button>
            </div>
        </div>
    </div>

    <script>
        let currentContent = '';

        function openModal(username) {
            const modal = document.getElementById('modal');
            const modalUsername = document.getElementById('modal-username');
            const modalText = document.getElementById('modal-text');
            const loadingIndicator = document.getElementById('loading-indicator');
            const contentInfo = document.getElementById('content-info');
            
            modalUsername.textContent = '@' + decodeURIComponent(username);
            modalText.value = '';
            currentContent = '';
            
            modal.style.display = 'flex';
            loadingIndicator.style.display = 'inline';
            contentInfo.style.display = 'none';
            
            const query = 'from:' + decodeURIComponent(username);
            const url = '/search?' + new URLSearchParams({
                q: query,
                username: '${username}',
                maxTokens: '50000'
            });
            
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch conversations');
                    }
                    return response.text();
                })
                .then(content => {
                    currentContent = content;
                    modalText.value = content;
                    
                    loadingIndicator.style.display = 'none';
                    contentInfo.style.display = 'inline';
                    
                    const tokens = Math.round(content.length/5);
                    contentInfo.textContent = \`\${tokens.toLocaleString()} tokens\`;
                })
                .catch(error => {
                    console.error('Error fetching conversations:', error);
                    modalText.value = 'Error loading conversations: ' + error.message;
                    loadingIndicator.style.display = 'none';
                    contentInfo.style.display = 'inline';
                    contentInfo.textContent = 'Error occurred';
                });
        }

        function closeModal() {
            document.getElementById('modal').style.display = 'none';
        }

        function copyToClipboard() {
            if (currentContent) {
                navigator.clipboard.writeText(currentContent).then(() => {
                    const button = event.target.closest('button');
                    const originalHTML = button.innerHTML;
                    button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Copied!';
                    setTimeout(() => {
                        button.innerHTML = originalHTML;
                    }, 2000);
                });
            }
        }

        // Close modal when clicking outside
        document.getElementById('modal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        });
    </script>
</body>
</html>`;

const dashboardPage = (
  user: UserContext["user"],
  stats: UserStats
) => `<!DOCTYPE html>
<html lang="en" class="bg-white">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - CloneChat</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        telegram: '#0088cc',
                        'telegram-dark': '#006ba6',
                        'telegram-light': '#e1f5ff',
                    }
                }
            }
        }
    </script>
    <style>
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");

        body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .gradient-bg {
            background: linear-gradient(135deg, #0088cc 0%, #006ba6 100%);
        }

        .glass {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 136, 204, 0.1);
        }

        .status-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }

        .progress-bar {
            background: linear-gradient(90deg, #0088cc, #006ba6, #0088cc);
            background-size: 200% 100%;
            animation: shimmer 2s ease-in-out infinite;
        }

        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }

        .progress-container {
            background: rgba(0, 136, 204, 0.1);
            border-radius: 9999px;
            overflow: hidden;
            position: relative;
        }

        .progress-container::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            transform: translateX(-100%);
            animation: progress-shine 2s ease-in-out infinite;
        }

        @keyframes progress-shine {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .premium-glow {
            box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
            border: 2px solid #f59e0b;
        }
    </style>
</head>
<body class="bg-gray-50">
    <main class="min-h-screen px-4 py-6">
        <div class="max-w-4xl mx-auto">
            <!-- Header -->
            <header class="flex items-center justify-between mb-8">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 gradient-bg rounded-2xl flex items-center justify-center">
                        <span class="text-white font-bold text-xl">💬</span>
                    </div>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">CloneChat</h1>
                        <p class="text-gray-600">Your AI clone dashboard</p>
                    </div>
                </div>

                <div class="flex items-center gap-4">
                    <a href="/stats?username=${
                      user.username
                    }" class="text-blue-600 hover:text-blue-700 font-medium">
                        Stats
                    </a>
                    <a href="/logout" class="text-red-600 hover:text-red-700 font-medium">Logout</a>
                </div>
            </header>

            <!-- Profile & Status Card -->
            <div class="bg-white rounded-2xl p-6 shadow-sm mb-6">
                <div class="flex items-start gap-4">
                    ${
                      user.profile_image_url
                        ? `<img src="${user.profile_image_url}" alt="Profile" class="w-16 h-16 rounded-full border-2 border-gray-200 flex-shrink-0">`
                        : `<div class="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span class="text-gray-500 text-xl font-bold">${user.name
                              .charAt(0)
                              .toUpperCase()}</span>
                        </div>`
                    }
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-3 mb-2">
                            <h2 class="text-xl font-bold text-gray-900">${
                              user.name
                            }</h2>
                            ${
                              stats.isPremium
                                ? '<span class="bg-telegram text-white px-3 py-1 rounded-full text-sm font-medium">Premium</span>'
                                : ""
                            }
                        </div>
                        <p class="text-gray-600 mb-3">@${user.username}</p>
                        
                        <div class="grid grid-cols-3 gap-4">
                            <div class="text-center">
                                <div class="text-2xl font-bold text-gray-900">${stats.postCount.toLocaleString()}</div>
                                <div class="text-sm text-gray-500">Posts Analyzed</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold ${
                                  stats.scrapeStatus === "in_progress"
                                    ? "status-pulse text-telegram"
                                    : "text-gray-900"
                                }">
                                    ${
                                      stats.historyIsCompleted &&
                                      stats.syncedFrom
                                        ? "✅"
                                        : stats.scrapeStatus === "in_progress"
                                        ? "⟳"
                                        : stats.scrapeStatus === "failed"
                                        ? "❌"
                                        : "⏳"
                                    }
                                </div>
                                <div class="text-sm text-gray-500">Clone Status</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold text-gray-900">${
                                  stats.historyCount >= stats.historyMaxCount &&
                                  !stats.isPremium
                                    ? "100%"
                                    : Math.round(
                                        (stats.historyCount /
                                          stats.historyMaxCount) *
                                          100
                                      ) + "%"
                                }</div>
                                <div class="text-sm text-gray-500">Completion</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${
                  stats.scrapeStatus === "in_progress"
                    ? `
                <!-- Progress Bar -->
                <div class="mt-4 mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-telegram">Creating your AI clone...</span>
                        <span class="text-sm text-gray-500">${Math.round(
                          (stats.historyCount / stats.historyMaxCount) * 100
                        )}%</span>
                    </div>
                    <div class="progress-container h-2 relative">
                        <div class="progress-bar h-full" style="width: ${Math.round(
                          (stats.historyCount / stats.historyMaxCount) * 100
                        )}%"></div>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${stats.historyCount.toLocaleString()} / ${stats.historyMaxCount.toLocaleString()} posts processed
                    </div>
                </div>
                `
                    : ""
                }
                
                <div class="mt-4 p-4 bg-gray-50 rounded-xl">
                    <div class="flex items-center gap-3 mb-2">
                        <div class="w-6 h-6 ${
                          stats.historyIsCompleted && stats.syncedFrom
                            ? "bg-green-500"
                            : stats.scrapeStatus === "in_progress"
                            ? "bg-telegram"
                            : "bg-gray-400"
                        } rounded-full flex items-center justify-center flex-shrink-0">
                            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                            </svg>
                        </div>
                        <span class="font-medium text-gray-900">
                            ${
                              stats.syncedFrom && stats.historyIsCompleted
                                ? "Your AI clone is ready!"
                                : stats.scrapeStatus === "in_progress"
                                ? "Creating your AI clone..."
                                : stats.scrapeStatus === "failed"
                                ? "Clone creation failed"
                                : "Clone can be previewed"
                            }
                        </span>
                    </div>
                    <p class="text-sm text-gray-600">
                        ${
                          stats.syncedFrom && stats.historyIsCompleted
                            ? "Your clone is live and ready for conversations"
                            : stats.scrapeStatus === "in_progress"
                            ? "We're analyzing your posts to create an accurate AI representation. This may take a few minutes."
                            : stats.scrapeStatus === "failed"
                            ? "Something went wrong. Please refresh the page to retry."
                            : stats.isPremium
                            ? "Ready to create your premium clone with full post history."
                            : "Get the premium version to unlock your full AI clone potential."
                        }
                    </p>
                </div>
            </div>

            <!-- Clone Settings Card -->
            <div class="bg-white rounded-2xl p-6 shadow-sm mb-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                        <span class="text-gray-600 font-bold">⚙️</span>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900">Clone Settings</h3>
                </div>
                
                <div class="space-y-4">
                    <label class="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors">
                        <input type="checkbox" id="public-check" ${
                          stats.isPublic ? "checked" : ""
                        }
                            class="mt-1 w-5 h-5 text-telegram rounded focus:ring-telegram">
                        <div class="flex-1">
                            <span class="font-medium text-gray-900 block">Clone is public</span>
                            <span class="text-sm text-gray-600">Deselecting it means only you will be able to chat</span>
                        </div>
                    </label>
                </div>
            </div>

            ${
              !stats.isPremium
                ? `
            <!-- Premium Upgrade Card -->
            <div class="bg-gradient-to-br from-orange-50 to-amber-50 premium-glow rounded-2xl p-6 mb-6">
                <div class="flex items-start gap-4">
                    <div class="text-4xl">🚀</div>
                    <div class="flex-1">
                        <h3 class="text-xl font-bold text-orange-800 mb-2">Unlock Your Full AI Clone</h3>
                        <p class="text-orange-700 mb-4">
                            You're currently limited to basic functionality. Upgrade to Premium for:
                        </p>
                        <ul class="text-orange-700 mb-4 space-y-1">
                            <li class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                                Up to 100,000 historic posts analyzed
                            </li>
                            <li class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                                Powered by advanced Grok AI
                            </li>
                            <li class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                                Real-time post updates
                            </li>
                            <li class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                                Custom shareable link
                            </li>
                            <li class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                                Lifetime access - no subscriptions!
                            </li>
                        </ul>
                        <div class="flex items-center gap-4">
                            <div class="text-3xl font-bold text-red-600">$29</div>
                            <div>
                                <span class="line-through text-gray-500 text-lg">$129</span>
                                <span class="bg-red-500 text-white px-2 py-1 rounded text-sm font-semibold ml-2">77% OFF</span>
                            </div>
                        </div>
                        <p class="text-sm text-orange-600 mb-4 font-semibold">⚡ Early Bird Special - Limited Time!</p>
                        <a href="${PAYMENT_LINK_URL}?client_reference_id=${user.username}" 
                           class="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-6 py-3 rounded-full font-semibold transition-all transform hover:scale-105 shadow-lg">
                            <span>🔥</span>
                            Get Premium Now - $29
                        </a>
                    </div>
                </div>
            </div>
            `
                : ""
            }

            ${
              stats.syncedFrom
                ? `
            <!-- Clone Link Card -->
            <div class="bg-white rounded-2xl p-6 shadow-sm mb-6">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                        <span class="text-green-600 font-bold">🔗</span>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900">${
                      stats.isPremium && stats.historyIsCompleted
                        ? "Your Clone is Live!"
                        : "Preview your clone"
                    }</h3>
                </div>
                
                <!-- Big Prominent Bio Section -->
                <div class="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-2xl p-6 mb-6">
                    <h4 class="text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
                        <span class="text-2xl">✨</span>
                        Add to your X bio:
                    </h4>
                    <div class="bg-white rounded-xl p-4 mb-4 border-2 border-green-200">
                        <div class="flex items-center gap-3 mb-3">
                            <code class="flex-1 text-lg font-mono text-telegram font-semibold" id="bio-link">
                                https://clonechat.me/${user.username}
                            </code>
                            <button onclick="copyBioLink()" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                </svg>
                                Copy
                            </button>
                            <a href="https://clonechat.me/${
                              user.username
                            }" target="_blank" class="bg-telegram hover:bg-telegram-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                </svg>
                                Visit
                            </a>
                        </div>
                        <p class="text-sm text-gray-600 text-center">${
                          !stats.isPremium
                            ? "Buy premium to allow anyone to view this page!"
                            : "Let your followers chat with your AI clone 24/7!"
                        }</p>
                    </div>
                </div>
                
                <div class="text-center">
                    <p class="text-sm text-gray-600 mb-3">Perfect for your X bio, website, or anywhere you want to be accessible 24/7</p>
                    <a href="https://clonechat.me/${
                      user.username
                    }" target="_blank" class="inline-flex items-center gap-2 text-telegram hover:text-telegram-dark font-medium">
                        <span>💬</span>
                        Preview Your Clone
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                    </a>
                </div>
            </div>
            `
                : ""
            }



        </div>
    </main>

    <script>
        const publicCheck = document.getElementById('public-check');

        function updateSettings() {
            const params = new URLSearchParams();
            params.set('public', publicCheck.checked);
            window.location.href = '/dashboard?' + params.toString();
        }

        publicCheck.addEventListener('change', updateSettings);

        function copyBioLink() {
            const linkElement = document.getElementById('bio-link');
            navigator.clipboard.writeText(linkElement.textContent.trim()).then(() => {
                const button = event.target.closest('button');
                const originalHTML = button.innerHTML;
                button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Copied!';
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                }, 2000);
            });
        }


    </script>
</body>
</html>`;

export default {
  fetch: withSimplerAuth(
    async (request: Request, env: Env, ctx: UserContext) => {
      // Ensure required environment variables are present
      if (!env.X_API_KEY) {
        return new Response("X_API_KEY environment variable is required", {
          status: 500,
        });
      }

      const url = new URL(request.url);

      if (url.pathname === "/mcp") {
        return handleMcp(request, env, ctx);
      }

      // Handle login page
      if (url.pathname === "/login") {
        if (ctx.authenticated) {
          return Response.redirect(url.origin + "/dashboard", 302);
        }
        return new Response(loginPage, {
          headers: { "Content-Type": "text/html;charset=utf8" },
        });
      }

      if (url.pathname.endsWith("/admin")) {
        if (!ctx.authenticated) {
          return Response.redirect(url.origin + "/login", 302);
        }

        if (ctx.user.username !== ADMIN_USERNAME) {
          return new Response("Unauthorized", { status: 401 });
        }

        const username = url.pathname.split("/")[1];

        try {
          // Get user's Durable Object
          const userDO = env.USER_DO.get(
            env.USER_DO.idFromName(DO_NAME_PREFIX + username)
          );

          return studioMiddleware(request, userDO.raw, {
            dangerouslyDisableAuth: true,
          });
        } catch (error) {
          console.error("Admin error:", error);
          return new Response("Error loading admin", { status: 500 });
        }
      }

      if (url.pathname.endsWith("/sync")) {
        const username = url.pathname.split("/")[1];

        if (!ctx.user?.username) {
          return new Response("Unauthorized", { status: 401 });
        }

        const userDO = env.USER_DO.get(
          env.USER_DO.idFromName(DO_NAME_PREFIX + username)
        );

        const user = await userDO.ensureUserExists(username);
        // Start sync after payment
        await userDO.startSync(username);
        return new Response("Started sync");
      }

      // Handle dashboard page
      if (url.pathname === "/dashboard") {
        if (!ctx.authenticated) {
          return Response.redirect(url.origin + "/login", 302);
        }

        try {
          // Get user's Durable Object
          const userDO = env.USER_DO.get(
            env.USER_DO.idFromName(DO_NAME_PREFIX + ctx.user.username)
          );

          // Handle query parameters for public/featured updates
          const isPublic = url.searchParams.get("public") === "true";
          const isFeatured = url.searchParams.get("featured") === "true";

          // Update database if query parameters are present
          if (
            url.searchParams.has("public") ||
            url.searchParams.has("featured")
          ) {
            let updateQuery = "UPDATE users SET ";
            const updateParams = [];
            const updateParts = [];

            if (url.searchParams.has("public")) {
              updateParts.push("is_public = ?");
              updateParams.push(isPublic ? 1 : 0);
            }

            if (url.searchParams.has("featured")) {
              updateParts.push("is_featured = ?");
              updateParams.push(isFeatured ? 1 : 0);
            }

            updateQuery +=
              updateParts.join(", ") +
              ", updated_at = CURRENT_TIMESTAMP WHERE id = ?";
            updateParams.push(ctx.user.id);

            await userDO.exec(updateQuery, ...updateParams);
          }

          // Get user stats (this will now include the updated values)
          const stats = await userDO.getUserStats();
          const dashboardHtml = dashboardPage(ctx.user, stats);

          return new Response(dashboardHtml, {
            headers: { "Content-Type": "text/html;charset=utf8" },
          });
        } catch (error) {
          console.error("Dashboard error:", error);
          return new Response("Error loading dashboard", { status: 500 });
        }
      }

      if (url.pathname === "/stripe-webhook") {
        return handleStripeWebhook(request, env);
      }

      if (url.pathname === "/stats") {
        const username = url.searchParams.get("username") || ctx.user?.username;

        if (!username) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          // Get user's Durable Object
          const userDO = env.USER_DO.get(
            env.USER_DO.idFromName(DO_NAME_PREFIX + username)
          );

          // Get author stats
          const userStats = await userDO.getUserStats();
          const stats = await userDO.getInteractions(150);

          if (
            ctx.user.username !== username &&
            ctx.user?.username !== ADMIN_USERNAME &&
            !userStats?.isPublic
          ) {
            return new Response("User did not make their posts public", {
              status: 401,
            });
          }

          const statsHtml = statsPage(username, stats, userStats);
          return new Response(statsHtml, {
            headers: { "Content-Type": "text/html;charset=utf8" },
          });
        } catch (error) {
          console.error("Stats page error:", error);

          if (error.message === "User not found") {
            return new Response("User not found", { status: 404 });
          }

          if (error.message === "User did not make posts public") {
            return new Response("This user has not made their posts public", {
              status: 403,
            });
          }

          return new Response("Error loading stats page", { status: 500 });
        }
      }

      if (url.pathname === "/search") {
        const username = url.searchParams.get("username") || ctx.user.username;
        if (!username) {
          return new Response("Please provide ?username", { status: 400 });
        }
        const userDO = env.USER_DO.get(
          env.USER_DO.idFromName(DO_NAME_PREFIX + username)
        );

        const toolResponse = await handleSearchTool(
          request,
          {
            q: url.searchParams.get("q"),
            maxTokens: url.searchParams.get("maxTokens"),
          },
          env,
          ctx,
          userDO
        );
        return new Response(toolResponse.content[0].text);
      }

      const username = url.pathname.slice(1);
      const usernameRegex = /^[a-zA-Z0-9_]{1,15}$/;

      const isValid =
        usernameRegex.test(username) &&
        !username.startsWith("_") &&
        !/^\d+$/.test(username); // Not only numbers

      if (username === "" || username.includes("/") || !isValid) {
        return new Response("Not found", { status: 404 });
      }

      // valid potential x username

      return new Response(shareHtml.replaceAll("{{username}}", username), {
        headers: { "Content-Type": "text/html;charset=utf8" },
      });
    },
    { isLoginRequired: false, scope: "profile" }
  ),
} satisfies ExportedHandler<Env>;

const streamToBuffer = async (
  readableStream: ReadableStream<Uint8Array>
): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  const reader = readableStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);

  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }

  return result;
};
