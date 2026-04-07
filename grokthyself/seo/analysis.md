# SEO Analysis — GrokThyself

## Product Summary

GrokThyself is a $8/month SaaS that connects your X (Twitter) account and GitHub account, then continuously syncs your tweets, bookmarks, and likes into a private GitHub repository. The name is a play on the ancient aphorism "Know Thyself."

---

## Target Audience

| Segment                        | Pain point                                                        |
| ------------------------------ | ----------------------------------------------------------------- |
| X power users / heavy tweeters | Fear of losing content if banned or if X shuts down               |
| Writers & creators             | Tweets are drafts, threads are ideas — want them backed up        |
| Researchers & analysts         | Want queryable, version-controlled personal data                  |
| Privacy-conscious users        | Want their data under their own control, not just on X            |
| Developers                     | Comfortable with GitHub; want structured data in a familiar place |

---

## Keyword Research

### Primary keywords (high intent, moderate competition)

| Keyword                       | Intent                     | Notes                                       |
| ----------------------------- | -------------------------- | ------------------------------------------- |
| twitter archive backup        | Informational / Commercial | Core use case                               |
| save tweets automatically     | Commercial                 | Direct feature match                        |
| X bookmarks backup            | Commercial                 | Bookmarks are notoriously hard to export    |
| twitter bookmarks export      | Commercial                 | High pain point since X removed easy export |
| backup twitter data to github | Commercial                 | Niche but very high intent                  |
| export twitter likes          | Informational / Commercial | People lose liked tweets constantly         |

### Secondary keywords

| Keyword                              | Intent        | Notes                           |
| ------------------------------------ | ------------- | ------------------------------- |
| twitter data export tool             | Commercial    | Broader; lots of competition    |
| how to archive tweets                | Informational | Good for blog content           |
| twitter to github sync               | Commercial    | Very specific, very high intent |
| personal data ownership social media | Informational | Thought leadership angle        |
| self-hosted twitter archive          | Informational | Captures users who'd prefer DIY |
| x.com data backup                    | Commercial    | Post-rebrand keyword            |

### Long-tail / question keywords (blog targets)

- "how to back up your twitter bookmarks"
- "what happens to your tweets when you get banned"
- "can you export twitter bookmarks"
- "how to save all your twitter likes"
- "twitter archive vs third party backup"
- "is it safe to connect twitter to github"

---

## Competitor Landscape

| Tool                                 | Positioning                           | Gap GrokThyself can own            |
| ------------------------------------ | ------------------------------------- | ---------------------------------- |
| Twitter's official archive           | Manual download, not continuous       | GrokThyself is automatic & ongoing |
| Tweetback (self-hosted)              | Developer-only, complex setup         | GrokThyself is one-click           |
| Semiphemeral                         | Focuses on deletion, not preservation | Opposite value prop                |
| Notion/Readwise Twitter integrations | Saves highlights, not full archive    | GrokThyself is comprehensive       |
| IFTTT / Zapier recipes               | Fragile, shallow, not retroactive     | GrokThyself is deep & reliable     |

**Positioning opportunity:** "The only tool that continuously backs up your tweets, bookmarks, AND likes to GitHub — automatically."

---

## On-Page SEO Recommendations

### Homepage

**Title tag:** `GrokThyself — Auto-backup your X tweets, bookmarks & likes to GitHub`  
**Meta description:** `Never lose a tweet again. GrokThyself syncs your X posts, bookmarks, and likes to a private GitHub repo automatically. $8/month. Connect in 60 seconds.`

**H1:** "Know your X data. Own your X data."  
**H2s:**

- "Everything you post, like, and save — backed up automatically"
- "Your data lives in your GitHub repo, not our servers"
- "Set it up in 60 seconds"

### Key trust signals to add to the page

- "Private repo — only you can see it"
- "We never store your tweets — they go straight to your GitHub"
- "Works with free GitHub accounts"
- Exact count of tweets/bookmarks/likes synced (social proof)

---

## Technical SEO Checklist

- [ ] Add `<title>` and `<meta name="description">` tags to the HTML served by the worker
- [ ] Add Open Graph tags (`og:title`, `og:description`, `og:image`) for Twitter/X card previews (ironic but important)
- [ ] Add `robots.txt` allowing crawl
- [ ] Add `sitemap.xml` listing homepage + blog posts
- [ ] Ensure the Cloudflare Worker serves correct `Content-Type: text/html` with proper charset
- [ ] Add structured data (JSON-LD) for SoftwareApplication schema
- [ ] Ensure mobile-responsive layout
- [ ] Page speed: Worker edge delivery is already fast — confirm no blocking scripts
- [ ] Add canonical URLs to all pages
- [ ] `/seo/blogs` posts should be served at clean URLs like `/blog/post-slug`

---

## Content Strategy

### Blog cadence: 1 post every 2 weeks

**Pillar topics:**

1. Data ownership & personal archiving
2. X/Twitter power user productivity
3. GitHub as personal knowledge base

### Blog post pipeline (see `/seo/blogs/`)

| Filename                                  | Target keyword                          | Funnel stage     |
| ----------------------------------------- | --------------------------------------- | ---------------- |
| `twitter-bookmarks-backup.md`             | twitter bookmarks backup / export       | Bottom of funnel |
| `what-happens-tweets-when-banned.md`      | what happens to your tweets when banned | Middle of funnel |
| `github-personal-knowledge-base.md`       | github personal knowledge base          | Top of funnel    |
| `twitter-archive-vs-continuous-backup.md` | twitter archive vs backup               | Middle of funnel |
| `own-your-social-media-data.md`           | own your social media data              | Top of funnel    |

---

## Distribution Channels

- **X/Twitter itself:** Post threads about the product — the irony is content
- **Hacker News:** "Show HN: I built a tool that backs up your X tweets/likes to GitHub" — very on-brand for HN
- **GitHub Explore / Awesome lists:** Submit to awesome-selfhosted adjacent lists
- **IndieHackers:** Document the build journey
- **Product Hunt:** Launch with a focus on "data ownership"
- **Reddit:** r/DataHoarder, r/selfhosted, r/Twitter

---

## Backlink Opportunities

- Write a guest post for a developer blog about X API + GitHub API integration
- Get listed on SaaStr/AppSumo adjacent "tools for creators" lists
- Reach out to X power user newsletters (high audience overlap)
- Get listed on alternativeto.net as an alternative to Tweetback
