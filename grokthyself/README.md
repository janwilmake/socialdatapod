# Simple MCP for your own context

- Login with X to get personal MCP link for free
- Upon one-time purchase ($129) it will index all of your history for private use with continuous updates
- In settings, switch between public/private

Context I want for myself:

- All my posts and comments and the entire thread of these surrounding my comments/posts
- Insights on the people I interacted with most (we have this data, it's just a query)

How:

- https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/refs/heads/main/schema/draft/schema.ts
- https://uithub.com/janwilmake/universal-mcp-oauth/blob/main/simplerauth-client/README.md with x-oauth-provider for login
- https://github.com/janwilmake/with-mcp for mcp; tools:
  - `timeline({q})`
- Stripeflare for one-time purchase $99 to get user a balance

# TODO

### Observations 🤔

Before chatting with anyone, I just want this to work for a few people. Easy ability to enable/disable people in any client!

- Adapt `/sync` so it can make someone premium too.
- Build a `is_public:false` model with full history for the most interesting people I want to talk to more - https://clonechat.me/stats?username=janwilmake
- Ask them if this is OK. tell them about the product if they're curious.
- See if the habit of chatting with people through tools sticks with me and if it helps me engage with them more.

This is something I really want to just have in my personal toolkit as a start.

Then, make these improvements!

- There's not enough overlap on most people. we need to get more context about both people than just that, so we need to access two DOs and get a shared context in the system prompt.
- We need the authorization step at login because new users should directly install it and just log in once!
- After login, it's vital to immediately start syncing and have something within a few seconds. If there wasn't an initial sync yet, respond with PLEASE WAIT in the toolcall.
- Update `share.html` to adapt to be preview as well as live page. Professional and with profile image.

After this it's definitely shareable!

### OpenAI ChatGPT issues

This seems to be due to the resource being null and we have ` if (!resource || authData.resource !== resource) {` in `x-oauth-provider` token endpoint. Let's test cursor + vscode too. Fix or wait for this [situation](https://github.com/openai/openai-apps-sdk-examples/issues/33) to improve

```
{
    "detail": {
        "message": "Token exchange failed: 400, message='Bad Request', url=URL('https://login.wilmake.com/token')",
        "connector_id": "connector_68ed1757b25c8191b772bd0fcfb80547"
    }
}
```

Another problem is the fact that OpenAI doesn't expose all enabled MCPs directly, they are behind a search tool. This completely changes the game, and makes it pretty much impossible to have a system prompt.

### Deeper search model

I think ultimately, everyone needs a `/chat/completions` endpoint because we want to also add things like a `fetch` tool and add reasoning, because this will drastically improve output quality. It can then be connected to further MCPs like messasing me, booking an appointment with me, or other things.

### Improvements

- Icon won't work but it MAY work if we use a subdomain. Seems heavily cached so need to know more! Test different clients too.
- Fix: Show more correct percentage that estimates based on total posts and stucks at 95% until done
- Fix: Include quoted posts - It should show the quoted thing too!!! context should be available in result already. Just simply make it part of the text in this case.

## Launch

Talk to people and find a way to position it such that there's a quick wow-moment and willingness to purchase for $129 one-time (and think about subscription too). After a few people I talked with actually like and use it, do a launch! Let's not launch too early, let's also not keep building more than above! The bigger potential is huge and it's very tempting, but don't work on that more until I have demand.

## Chat with people

- Macieklaskus (meeting) - https://x.com/messages/153933445-370640384 (scared to talk cuz its so tempting)
- Michael Gold (meeting) https://x.com/i/chat/10756682-153933445
- Josh http://x.com/joshtriedcoding/status/1977337502844563557
- https://x.com/lwz_ai (he was curious about it before, big CEO money)
- Rob (Vietnam) https://x.com/robj3d3
- maurice_kleine - https://x.com/maurice_kleine/status/1975378556902654139
- marcuswquinn - https://x.com/marcuswquinn/status/1975207453974556762
- Scobleizer - https://x.com/Scobleizer/status/1975102387758285091
- https://x.com/monadoid (agent-pod)

## Main hypotheses

- The intersection of interests between two people must be uncovered and expanded in order to forge valuable interaction. Using AI this intersection can be found much faster.

![](venn.png)

- If I had this in my claude for 10 people that I really admire but are unreachable to me, I would chat with these people much more often and find more ways to interact with them.

![](people-chat.png)

- People are relatable and conversations expand and strengthen networks, AIs consolidate and weaken pre-existing ties through addiction and eroding confidence in others versus the 'superintelligence'. clonechat could change this!

- X has a great context to be a **starting point for personal superintelligence**. Modeling people and giving them access to tools can give rise to a new paradigm of AI that actually understands and has the needed context to do more, with less instructions.

- LinkTree is a very interesting company to be inspired by because they convinced people to put a link in their bio. What if I could convince a niche to do the same? [Analysing this here](linktree)

## Distribution

people that sell knowledge want a model

content creztors (podcasts) want to have the source posts quotable so people can start following there as alternate feed of info

scoble

do marketing like this!!! https://x.com/alex_prompter/status/2017044857764688132

Target audience: content creators that already make $10k/month with their content

Strategy:

1. identify who i follow who fits the niche of 'content creators earning more than $2k/m' with their content
2. tag them tweeting 'I created a Theo AI' showing a video with the MCP
3. find them in other places https://contextarea.com/rules-httpsrawg-1dppy2af07o0wa
