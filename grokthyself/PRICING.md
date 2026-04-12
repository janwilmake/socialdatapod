# Pricing Model

**Subscription**: $8/month per user
**Main variable cost**: X API at $0.005 per post returned

## How syncs work

A cron runs daily at 2:00 AM UTC. For each subscribed user, three endpoints are called:

### Posts (tweets)

- Uses `since_id` as an **API parameter** — X only returns new tweets server-side
- Page size: 10 (incremental), 100 (first sync)
- An inactive user gets `result_count: 0` — **zero cost**

### Bookmarks

- X API has **no server-side `since_id`** — always returns newest bookmarks first (ordered by bookmark time)
- Probe page: **1 item** (API minimum for bookmarks)
- If the probe item matches the stored `sinceId` → no new bookmarks, done. **Cost: 1 post = $0.005**
- If new bookmarks exist → fetch additional pages of **10** until `sinceId` match or 200-item cap
- Worst case (sinceId removed by un-bookmarking): fetches 200 items then stops

### Likes

- Same as bookmarks — no server-side `since_id`, ordered by like time
- Probe page: **5 items** (API minimum for likes)
- If probe's first item matches `sinceId` → done. **Cost: 5 posts = $0.025**
- If new likes exist → fetch additional pages of **10** until `sinceId` match or 200-item cap

## Cost per user per month (30 days)

### Inactive user (0 tweets, 0 bookmarks, 0 likes per day)

| Endpoint   | Posts billed/day | Cost/day |
|------------|-----------------|----------|
| Posts      | 0               | $0.000   |
| Bookmarks  | 1               | $0.005   |
| Likes      | 5               | $0.025   |
| **Total**  | **6**           | **$0.030** |

**Monthly cost: $0.90** — Margin: **$7.10**

### Light user (5 tweets, 3 bookmarks, 10 likes per day)

| Endpoint   | Posts billed/day | Cost/day | Reasoning |
|------------|-----------------|----------|-----------|
| Posts      | 5               | $0.025   | since_id server-side, API returns exactly 5 |
| Bookmarks  | 1 + 10 = 11     | $0.055   | Probe (1 new) + one page of 10 (2 new + sinceId hit) |
| Likes      | 5 + 10 = 15     | $0.075   | Probe (5 new) + one page of 10 (5 new + sinceId hit) |
| **Total**  | **31**          | **$0.155** |

**Monthly cost: $4.65** — Margin: **$3.35**

### Heavy user (20 tweets, 10 bookmarks, 30 likes per day)

| Endpoint   | Posts billed/day | Cost/day | Reasoning |
|------------|-----------------|----------|-----------|
| Posts      | 20              | $0.100   | 2 pages of 10 |
| Bookmarks  | 1 + 10 = 11     | $0.055   | Probe + one page of 10 covers it |
| Likes      | 5 + 30 = 35     | $0.175   | Probe + 3 pages of 10 |
| **Total**  | **66**          | **$0.330** |

**Monthly cost: $9.90** — Margin: **-$1.90** (unprofitable)

### Power user (50 tweets, 20 bookmarks, 80 likes per day)

| Endpoint   | Posts billed/day | Cost/day |
|------------|-----------------|----------|
| Posts      | 50              | $0.250   |
| Bookmarks  | 1 + 20 = 21     | $0.105   |
| Likes      | 5 + 80 = 85     | $0.425   |
| **Total**  | **156**         | **$0.780** |

**Monthly cost: $23.40** — Margin: **-$15.40**

## First sync (new subscriber)

First sync has no `sinceId`, so it uses page size 100 and fetches up to 1000 items per endpoint.

Worst case: 3 x 1000 = 3000 posts = **$15.00 one-time cost**

## Key risks

1. **sinceId removal**: If a user un-bookmarks or un-likes the tweet saved as `sinceId`, the exact ID match never fires. Pagination continues until the 200-item cap. Worst case daily cost: (1 + 200 + 5 + 200) x $0.005 = **$2.03/day** per affected user. This self-heals on the next sync since `newestId` is updated regardless.

2. **Retry amplification**: Failed syncs retry up to 3 times (delay 300s). Posts are safe (since_id already updated before bookmarks run). But if bookmarks succeed and likes fail, the retry re-runs `runSync` from the top, re-fetching the bookmarks probe page (1 post) since posts since_id was already updated. Minor cost.

## Break-even analysis

At $8/month with $0.005/post:
- Break-even: 1,600 posts/month = ~53 posts/day across all three endpoints
- A "light" user (~31 posts/day) is profitable
- A "heavy" user (~66 posts/day) is not
- Breakeven daily activity (assuming sinceId works): ~37 tweets + 10 bookmarks + 6 likes

## Cloudflare costs (negligible)

- Workers paid plan: $5/month (shared across all projects)
- Durable Objects: ~$0.01/month at 4 users
- Queues: ~$0.01/month
- Custom domain: free
