# Go to market seems legit

https://claude.ai/share/dd2290d2-baec-4554-854f-783980296be0

1. partner with tools or ads on "delete tweets"
2. partner with knowledge bases after getting a (secret or public) RSS URL

# Alternate names

Current domain: clonechat.me; short but cheap; no .com!

Available dot coms:

- cloneconvo.com
- chatwithmyclone.com
- bothermyclone.com

The last one is funny so may attract more interest especially from larger accounts that dont like DMs

# Alternate use-cases?

- headhunting; go through all your tweet history for this purpose.

# Embed it directly into X DMs

If someone DMs the clone answers if you dont answer within X period or if you say `/clone`? This could easen the ability to chat with the clone and make it work on the X app as well.

# Try Scoble: How do I create a viral post just from some examples for him?

- 🟠 Sync Scobleizer 100k posts
- Quote https://x.com/Scobleizer/status/1975102387758285091 and make a thread "I built an MCP that knows Scobleizer and his network perfectly" with examples

https://letmeprompt.com/rules-httpsuithu-aazo5hr9df5s9k

# Interaction Analysis

What's the most valuable? I guess a full context over my top N people is super valuable!!!!! Imagine a chat with janwilmake that knows his top 50 interactions very well, allowing it to use tool of another person context! Also, entities are super important for further deepening context. This is what will make it really stand out.

Core feature:

- After initial sync is complete (only for premium), for your top 150, do one LLM query per interaction, extracting `{ x_usernames:{[key:string]:string}, companies:{[key:string]:string}, websites:{[key:string]:string}, search_keywords:string[], interaction_summary:string,...}` and store `ai_analysis_interaction_count`.
- Redo it every week for accounts where more than 10 new interactions took place.
- Charge for LLM cost.
- Create `interactions_analysis:{summary:string,beliefs,principles,values}` which does an LLM prompt max once a month over all your interactions
- Add `interactions` JSON[] and `interactions_summary` into `users` as new columns
- Add interaction analysis into stats page
- Add structured data for this
- Add this as main MCP system prompt
- Create aggregate DO with just the users table (also has interactions)

<!--
See https://letmeprompt.com/httpsmarkdownfeed-xcibrc0

Doing weekly LLM-based named entity recognition on the last tokens in your timeline can be **incredibly powerful**! Imagine you could scope this for any person as a one-time scope or continuous scope, as long as they give access... This definitely is a product in itself that can make money. Should charge X price for its information...

It's perfect to then combine this with the task API: you login with X, then have a bunch of named entities as starting inputs for your APIs.

All in all, this could just be a tiny service:

- login with markdownfeed that has X money
- purchase feed for n weeks, and with that, accept terms (uses markdownfeed api)
- use api for letmeprompt + markdownfeed. generated result will become available as codeblock in a completion result at a fixed url
- provide this as oauth provider

Now, I can make the following for parallel

- Login with X
- Do one-time named entity recognition
- Any examples in the playground use these named entities
-->

# Custom MCP Chat Client

> [!WARNING]
> ⚠️ This is much harder to accomplish as it requires additional payment of end-user or owner

https://chat.clonechat.me/username should be a chat with the mcp enabled by default, authed with the mcp auth + openrouter for money; if this works, this is the primary option.

This is literally gold if done well. It should never halucinate and always stay w'in bounds of truth. People must be able to chat with it over my DMs if I don't reply. This is literally epic!

# Refactor to use advanced search

It seems in my manual way that i triggered sync twice. This must not be possible.

Advice from twitterapi.io admin: use advanced search and don't rely on cursor - it's less likely to get me into trouble with broken cursors

# SUPER WISHLIST

## LLMS.txt and context IDE integrations

Based on the interactions analysis we can also create a llms.txt for custom contexts. This can in turn be integrated with tools like https://conare.ai. Another way could be as MCP resources.

## Chat Completion Thread Simulation

Imagine you could simulate a conversation between 2 (or more) profiles. This is such an underexplored new paradigm!

## Private datapoints

Mainly:

- dms
- likes
- bookmarks

Some can be done at $200/m, while some likely require $5000/m

## OAuth Provider with scopes

Allow {CLIENT_ID} to get access to:

- my network
- my interaction analysis
- entities
- my recent posts & comments

This is huge! Must put checkmarks into oauth provider as well.
