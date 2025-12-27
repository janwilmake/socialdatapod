/// <reference types="@cloudflare/workers-types" />
import { withSimplerAuth } from "simplerauth-client";

interface Env {
  TWITTERAPI_KEY: string;
}

interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  author: {
    userName: string;
    name: string;
    profilePicture: string;
  };
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  viewCount: number;
  entities?: {
    urls?: Array<{ url: string; expanded_url: string; display_url: string }>;
    user_mentions?: Array<{ screen_name: string; name: string }>;
    hashtags?: Array<{ text: string }>;
  };
  inReplyToId?: string;
  quoted_tweet?: Tweet;
  retweeted_tweet?: Tweet;
}

export default {
  fetch: withSimplerAuth(
    async (request: Request, env: Env, ctx) => {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health check
      if (path === "/") {
        return new Response(
          `# XYMake - Turn X Threads into Markdown

Usage:
- Visit /{username}/status/{tweet_id} to get a thread as markdown
- Change x.com to xymake.com in any X URL

${
  ctx.authenticated ? `Logged in as: @${ctx.user?.username}` : "Not logged in"
}`,
          { headers: { "content-type": "text/markdown" } },
        );
      }

      // Parse X thread URL: /{username}/status/{tweet_id}
      const match = path.match(/^\/([^\/]+)\/status\/(\d+)/);
      if (!match) {
        return new Response(
          "Invalid URL format. Use: /{username}/status/{tweet_id}",
          {
            status: 400,
          },
        );
      }

      const [, username, tweetId] = match;

      try {
        // Fetch thread context from TwitterAPI.io
        const thread = await fetchThreadContext(tweetId, env.TWITTERAPI_KEY);
        // Convert to markdown
        const markdown = await threadToMarkdown(thread, username, tweetId);

        return new Response(markdown, {
          headers: {
            "content-type": "text/markdown;charset=utf8",
            "cache-control": "public, max-age=3600",
          },
        });
      } catch (error: any) {
        return new Response(`Error fetching thread: ${error.message}`, {
          status: 500,
        });
      }
    },
    {
      isLoginRequired: true,
      oauthProviderHost: "login.wilmake.com",
    },
  ),
};

/**
 * Fetch thread context using TwitterAPI.io
 */
async function fetchThreadContext(
  tweetId: string,
  apiKey: string,
): Promise<Tweet[]> {
  const allTweets: Tweet[] = [];
  let cursor = "";
  let hasNextPage = true;

  while (hasNextPage) {
    const url = new URL(
      "https://api.twitterapi.io/twitter/tweet/thread_context",
    );
    url.searchParams.set("tweetId", tweetId);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey },
    });

    if (!response.ok) {
      throw new Error(
        `TwitterAPI error: ${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      tweets: Tweet[];
      has_next_page: boolean;
      next_cursor: string;
      status: string;
    };

    if (data.status === "error") {
      throw new Error("TwitterAPI returned error status");
    }

    if (data.tweets) {
      allTweets.push(...data.tweets);
    }
    hasNextPage = data.has_next_page && data.next_cursor;
    cursor = data.next_cursor || "";

    // Safety: limit to 10 pages
    if (allTweets.length > 200) {
      break;
    }
  }

  return allTweets;
}

/**
 * Convert thread to markdown
 */
async function threadToMarkdown(
  tweets: Tweet[],
  username: string,
  tweetId: string,
): Promise<string> {
  // Sort tweets chronologically
  const sortedTweets = tweets.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Find the main tweet
  const mainTweet =
    sortedTweets.find((t) => t.id === tweetId) || sortedTweets[0];

  if (!mainTweet) {
    return "No main tweet";
  }

  // Build markdown
  let markdown = `# X Thread by @${mainTweet?.author?.userName}\n\n`;
  markdown += `Original: https://x.com/${mainTweet?.author?.userName}/status/${mainTweet.id}\n\n`;
  markdown += `---\n\n`;

  for (const tweet of sortedTweets) {
    markdown += formatTweetAsMarkdown(tweet);
    markdown += `\n\n---\n\n`;
  }

  // Add stats at the end
  const totalLikes = sortedTweets.reduce(
    (sum, t) => sum + (t.likeCount || 0),
    0,
  );
  const totalRetweets = sortedTweets.reduce(
    (sum, t) => sum + (t.retweetCount || 0),
    0,
  );
  const totalViews = sortedTweets.reduce(
    (sum, t) => sum + (t.viewCount || 0),
    0,
  );

  markdown += `\n**Thread Stats:**\n`;
  markdown += `- ${sortedTweets.length} tweets\n`;
  markdown += `- ${totalLikes.toLocaleString()} likes\n`;
  markdown += `- ${totalRetweets.toLocaleString()} retweets\n`;
  markdown += `- ${totalViews.toLocaleString()} views\n`;

  return markdown;
}

/**
 * Format a single tweet as markdown
 */
function formatTweetAsMarkdown(tweet: Tweet): string {
  const date = new Date(tweet.createdAt).toLocaleString();
  let text = tweet.text;

  // Expand URLs
  if (tweet.entities?.urls) {
    for (const url of tweet.entities.urls) {
      text = text.replace(url.url, url.expanded_url);
    }
  }

  let md = `## @${tweet?.author?.userName} - ${date}\n\n`;
  md += `${text}\n\n`;

  // Add quoted tweet if present
  if (tweet.quoted_tweet) {
    md += `> **Quoting @${tweet.quoted_tweet?.author?.userName}:**\n`;
    md += `> ${tweet.quoted_tweet.text}\n\n`;
  }

  // Add engagement stats
  const stats = [];
  if (tweet.replyCount > 0) stats.push(`${tweet.replyCount} replies`);
  if (tweet.retweetCount > 0) stats.push(`${tweet.retweetCount} retweets`);
  if (tweet.likeCount > 0) stats.push(`${tweet.likeCount} likes`);
  if (tweet.viewCount > 0) stats.push(`${tweet.viewCount} views`);

  if (stats.length > 0) {
    md += `*${stats.join(" • ")}*\n`;
  }

  return md;
}
