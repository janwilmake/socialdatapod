# Pricing Model

**Subscription**: $8/month per user
**Main variable cost**: X API at $0.001 per post returned (Owned Reads pricing effective Apr 20, 2026)

## How syncs work

A cron runs daily at 2:00 AM UTC. For each subscribed user, three endpoints are called:

### Posts (tweets)

- Uses `since_id` as an **API parameter** — X only returns new tweets server-side
- Page size: 10 (incremental), 100 (first sync)
- An inactive user gets `result_count: 0` — **zero cost**

### Bookmarks

- X API has **no server-side `since_id`** — always returns newest bookmarks first (ordered by bookmark time)
- Probe page: **1 item** (API minimum for bookmarks)
- If the probe item matches the stored `sinceId` → no new bookmarks, done. **Cost: 1 post = $0.001**
- If new bookmarks exist → fetch additional pages of **10** until `sinceId` match or 200-item cap
- Worst case (sinceId removed by un-bookmarking): fetches 200 items then stops

### Likes

- Same as bookmarks — no server-side `since_id`, ordered by like time
- Probe page: **5 items** (API minimum for likes)
- If probe's first item matches `sinceId` → done. **Cost: 5 posts = $0.005**
- If new likes exist → fetch additional pages of **10** until `sinceId` match or 200-item cap

## Cost per user per month (30 days)

### Inactive user (0 tweets, 0 bookmarks, 0 likes per day)

| Endpoint  | Posts billed/day | Cost/day   |
| --------- | ---------------- | ---------- |
| Posts     | 0                | $0.000     |
| Bookmarks | 1                | $0.001     |
| Likes     | 5                | $0.005     |
| **Total** | **6**            | **$0.006** |

**Monthly cost: $0.18** — Margin: **$7.82**

### Light user (5 tweets, 3 bookmarks, 10 likes per day)

| Endpoint  | Posts billed/day | Cost/day   | Reasoning                                            |
| --------- | ---------------- | ---------- | ---------------------------------------------------- |
| Posts     | 5                | $0.005     | since_id server-side, API returns exactly 5          |
| Bookmarks | 1 + 10 = 11      | $0.011     | Probe (1 new) + one page of 10 (2 new + sinceId hit) |
| Likes     | 5 + 10 = 15      | $0.015     | Probe (5 new) + one page of 10 (5 new + sinceId hit) |
| **Total** | **31**           | **$0.031** |

**Monthly cost: $0.93** — Margin: **$7.07**

### Heavy user (20 tweets, 10 bookmarks, 30 likes per day)

| Endpoint  | Posts billed/day | Cost/day   | Reasoning                        |
| --------- | ---------------- | ---------- | -------------------------------- |
| Posts     | 20               | $0.020     | 2 pages of 10                    |
| Bookmarks | 1 + 10 = 11      | $0.011     | Probe + one page of 10 covers it |
| Likes     | 5 + 30 = 35      | $0.035     | Probe + 3 pages of 10            |
| **Total** | **66**           | **$0.066** |

**Monthly cost: $1.98** — Margin: **$6.02**

### Power user (50 tweets, 20 bookmarks, 80 likes per day)

| Endpoint  | Posts billed/day | Cost/day   |
| --------- | ---------------- | ---------- |
| Posts     | 50               | $0.050     |
| Bookmarks | 1 + 20 = 21      | $0.021     |
| Likes     | 5 + 80 = 85      | $0.085     |
| **Total** | **156**          | **$0.156** |

**Monthly cost: $4.68** — Margin: **$3.32**

## First sync (new subscriber)

First sync has no `sinceId`, so it uses page size 100 and fetches up to 1000 items per endpoint.

Worst case: 3 x 1000 = 3000 posts = **$3.00 one-time cost** (down from $15.00)

## Key risks

1. **sinceId removal**: If a user un-bookmarks or un-likes the tweet saved as `sinceId`, the exact ID match never fires. Pagination continues until the 200-item cap. Worst case daily cost: (1 + 200 + 5 + 200) x $0.001 = **$0.406/day** per affected user. This self-heals on the next sync since `newestId` is updated regardless.

2. **Retry amplification**: Failed syncs retry up to 3 times (delay 300s). Posts are safe (since_id already updated before bookmarks run). But if bookmarks succeed and likes fail, the retry re-runs `runSync` from the top, re-fetching the bookmarks probe page (1 post) since posts since_id was already updated. Minor cost.

## Break-even analysis

At $8/month with $0.001/post:

- Break-even: 8,000 posts/month = ~267 posts/day across all three endpoints
- All user tiers above are now comfortably profitable
- Even a power user (~156 posts/day) yields a $3.32/month margin

## Cloudflare costs (negligible)

- Workers paid plan: $5/month (shared across all projects)
- Durable Objects: ~$0.01/month at 4 users
- Queues: ~$0.01/month
- Custom domain: free
