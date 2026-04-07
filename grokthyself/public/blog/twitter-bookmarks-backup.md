---
title: "How to Back Up Your Twitter Bookmarks (Before You Lose Them)"
slug: twitter-bookmarks-backup
description: "Twitter bookmarks can't be exported natively. Here's why that's a problem — and the easiest ways to back them up automatically."
target_keyword: twitter bookmarks backup
funnel_stage: bottom
published: 2026-04-07
---

# How to Back Up Your Twitter Bookmarks (Before You Lose Them)

Your Twitter bookmarks are a graveyard of good intentions.

You save a thread about productivity at 11pm. You bookmark a recipe. You clip a long essay you swear you'll read this weekend. And then — quietly, without warning — a tweet gets deleted, an account gets suspended, or X changes its bookmarks UI and your entire collection becomes harder to navigate.

The problem nobody talks about: **bookmarks are the most fragile part of your X experience.** Unlike your own tweets, you have zero control over someone else's content. And unlike likes, bookmarks aren't even visible to anyone who might notice they disappeared.

## Why X's Native Archive Doesn't Save Your Bookmarks

X lets you download your data archive (Settings → Your account → Download an archive of your data). This is useful for your tweets, DMs, and follower lists. But your bookmarks? **They're not included.**

This has been a known limitation since the bookmarks feature launched. Despite years of user requests, X has never added bookmarks to the data export.

So if you rely on X bookmarks as a reading list or research tool, you're one account suspension or policy change away from losing everything.

## Three Ways to Back Up Your Bookmarks

### Option 1: Manual screenshot / copy-paste (not recommended)

You can manually go through your bookmarks and copy links into a document. This is tedious, doesn't scale, and becomes a full-time job if you're an active bookmarker. It also means your backup is always out of date.

### Option 2: Browser extensions

There are browser extensions that can snapshot your bookmarks at a point in time. These work okay for occasional exports but:
- They require you to remember to run them
- They only capture what's visible in the current bookmark list
- They break when X updates its frontend (which happens often)
- Your data lives in the extension's storage, not somewhere durable

### Option 3: Automatic continuous sync (recommended)

The most robust approach is to pipe your bookmarks into a storage system you control, automatically, on an ongoing basis. This is what **GrokThyself** does.

When you connect your X account and GitHub account, GrokThyself:

1. Fetches all your current bookmarks (going back as far as the API allows)
2. Writes them as structured files to a private GitHub repository
3. Continues syncing new bookmarks automatically as you save them

Your bookmarks end up as version-controlled Markdown or JSON files in a repo that only you can access. Even if a tweet gets deleted, you already have a copy. Even if X changes its bookmark UI, your data is safe.

## What Gets Saved

Each bookmark sync captures:
- The full tweet text
- The author's handle and display name
- The tweet URL
- The timestamp
- Any quoted tweets (where available)

The files are organized chronologically, so you can search, grep, or query them like any other text files.

## Why GitHub?

GitHub is a durable, version-controlled, searchable store for text. It's:
- **Free** for private repos (up to a generous storage limit)
- **Portable** — you can clone it, move it, or export it anytime
- **Versioned** — you can see exactly when a bookmark was added
- **Searchable** — GitHub's search works on private repos; so does `git grep`

Your bookmarks aren't locked in some startup's database. They're in your own GitHub account, under your own control.

## How to Set It Up

1. Go to [grokthyself.com](/)
2. Connect your X account (read-only access for bookmarks)
3. Connect your GitHub account (write access to create one private repo)
4. GrokThyself creates a private repo and starts the initial sync

The first sync can take a few minutes depending on how many bookmarks you have. After that, it stays current automatically.

The subscription is $8/month. Given that your bookmarks are irreplaceable by definition — once a tweet is deleted, it's gone forever — this is cheap insurance.

## The Real Cost of Not Backing Up

One account suspension. One API change. One X.com pivot. And your carefully curated research library, reading list, and idea bank is gone.

Bookmarks are valuable precisely because you chose to save them. Treat them accordingly.

---

*GrokThyself backs up your X tweets, bookmarks, and likes to a private GitHub repo — automatically. [Get started for $8/month](/#subscribe).*
