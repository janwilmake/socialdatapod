---
title: "The LLM Wiki: A Personal Knowledge Base That Actually Stays Current"
slug: github-personal-knowledge-base
description: "Most personal knowledge bases fail because the maintenance burden outpaces the value. The LLM wiki pattern — where an AI maintains structured markdown files from your raw sources — changes that equation permanently."
target_keyword: github personal knowledge base
funnel_stage: top
published: 2026-04-21
---

# The LLM Wiki: A Personal Knowledge Base That Actually Stays Current

Every knowledge management system eventually fails the same way.

You start with enthusiasm. You capture notes, tag articles, highlight passages. The system grows. Then one day you realize: the maintenance cost has quietly exceeded the value you're getting out of it. You stop adding to it. It becomes a graveyard of half-finished thoughts and stale references.

The problem isn't discipline. The problem is that the tedious part of maintaining a knowledge base — updating cross-references, resolving contradictions, keeping summaries current, pruning orphan pages — is exactly the kind of bookkeeping that humans are bad at and hate doing.

That's the problem the **LLM wiki pattern** solves.

## What an LLM Wiki Actually Is

The term comes from a pattern Andrej Karpathy described for building personal knowledge bases: instead of asking an LLM to search through raw documents on every query, you have it **incrementally build and maintain a persistent wiki** — structured markdown files that synthesize your sources once and stay current as new material comes in.

It's the difference between a research assistant who re-reads all your files every time you ask a question versus one who maintains a living document that captures what's already been understood, flags contradictions, and notes where the gaps are.

The architecture has three layers:

**Raw sources** — the immutable documents you curate. Articles, papers, exported data, transcripts. The LLM reads these but never modifies them. They're your source of truth.

**The wiki** — LLM-generated markdown files the agent creates and maintains: summaries, entity pages, concept pages, cross-references. This is the synthesized layer. It's what you actually search and read.

**The schema** — a configuration document (like a `CLAUDE.md`) that tells the LLM how to structure the wiki, what conventions to follow, and how to handle ingestion and maintenance. This is what makes the whole thing reproducible.

## Why This Works When Everything Else Doesn't

Traditional note-taking fails because you're the librarian. You have to decide where things go, update related pages when something changes, notice when two pieces of information contradict each other. Over time, this work compounds. The system grows harder to maintain the more valuable it becomes.

With the LLM wiki pattern, the LLM is the librarian. You add a raw source. The LLM ingests it — reads it, extracts key information, updates the relevant wiki pages, notes any contradictions with existing material, updates the index. The wiki gets better automatically.

You stay on the curation side. The LLM handles the bookkeeping.

## Three Operations That Keep the Wiki Healthy

**Ingest**: When you add a new raw source, the LLM reads it, discusses the key takeaways, writes a summary file, and integrates the information into existing wiki pages — adding cross-references, updating claims, flagging disagreements with what's already there.

**Query**: When you ask a question, the LLM searches the relevant wiki pages and synthesizes an answer with citations. If the answer surfaces something genuinely new, it files that synthesis back into the wiki as a new artifact.

**Lint**: Periodically, the LLM runs a health check on the entire wiki — finding contradictions between pages, identifying stale claims, surfacing orphan pages that haven't been referenced, noting gaps where the knowledge base is thin.

The result is a knowledge base that compounds over time instead of rotting.

## GitHub Is the Right Storage Layer

Plain markdown files in a private GitHub repository are the obvious substrate for this pattern, and for good reasons:

**It's version-controlled.** Every change the LLM makes to a wiki page is a commit. You can see exactly what changed, when, and why. You can diff any two versions of your understanding of a topic. You can revert if the LLM made a bad synthesis.

**It's searchable without infrastructure.** GitHub's search works on private repos. `git grep` works locally. You don't need a vector database or a search service — the files are just text.

**It's permanent.** Markdown files from 2004 are still readable. Git has been the dominant version control system for twenty years. Your wiki will outlast any SaaS tool.

**It's yours.** The repository is under your account. You control access. You can clone it anywhere, export it to any format, migrate it without anyone's permission.

Compare this to any proprietary knowledge base tool: Notion's database, Roam's graph, Obsidian Sync's vault. Each is a bet that the company stays alive, stays cheap, and stays aligned with your interests. A Git repository is a bet on an open format.

## Your Social Media Data as Raw Source

This is where it gets concrete for most people.

Your X (Twitter) history — years of tweets, bookmarks, and likes — is actually an extraordinary raw source for an LLM wiki. It's a record of your intellectual interests, your public reasoning, the things you found valuable enough to save. Most people have been curating this corpus for a decade without realizing it.

But it lives on someone else's servers, accessible only through their interface, and you've done nothing with it.

**GrokThyself** handles the raw source layer: it continuously syncs your X tweets, bookmarks, and likes into a private GitHub repository as plain text files. That's your raw source layer — current, owned, portable.

From there, you can point an LLM agent at that repository and run the wiki pattern on it. The agent reads your years of bookmarks, builds a structured wiki of your intellectual interests, maintains summaries of topics you've engaged with repeatedly, and flags contradictions in positions you've taken over time.

Your social media history becomes a knowledge base that you actually own — and that actually works.

## What the Wiki Looks Like in Practice

A well-structured LLM wiki in a GitHub repository might look like this:

```
wiki/
  index.md          ← content catalog, organized by category
  log.md            ← chronological record of ingestions and updates
  concepts/
    machine-learning.md
    distributed-systems.md
  people/
    researchers.md
    founders.md
  reading/
    summaries/
      paper-title.md
raw-sources/
  bookmarks/
    2024-01-15.md
  tweets/
    2024-01.md
schema.md           ← conventions and workflow instructions for the LLM
```

The `raw-sources/` directory is where GrokThyself syncs your X data. The `wiki/` directory is what the LLM builds and maintains. The `schema.md` tells the LLM how to do it consistently.

## Getting Started

1. **Get your raw sources flowing.** Set up GrokThyself to sync your X data to a private GitHub repo. This gives you the raw material layer automatically.

2. **Write a schema.** A simple markdown file describing the wiki structure you want — folder conventions, how to handle contradictions, what kinds of pages to maintain. The LLM follows this like a style guide.

3. **Run an initial ingestion.** Point an LLM agent at your raw sources and ask it to build the initial wiki. This is the one-time setup cost.

4. **Ingest incrementally.** As new data arrives — new tweets, new bookmarks — run the ingest operation on the new files. The wiki updates itself.

5. **Query and lint periodically.** Ask questions and let the LLM synthesize answers back into the wiki. Run a lint pass every few weeks to keep it clean.

The maintenance burden drops to near zero. The knowledge base improves automatically. The ancient problem of the rotting second brain is solved.

---

*GrokThyself syncs your X tweets, bookmarks, and likes to a private GitHub repo automatically — giving you the raw source layer your LLM wiki needs. [Start for $8/month](/#subscribe).*
