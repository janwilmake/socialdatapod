This bookmark exporter allows exporting bookmarks via the API. It works on the free plan because there's a refresh every 15 minutes. However, this bug is still a problem so we get only the 99 most recent bookmarks: https://devcommunity.x.com/t/twitter-api-bookmarks-paging-not-working/190355/19

TODO:

- for each tweet, get the context (can be a thread, can have quoted info, can have media). create `lib/twitterApiGetThreadContext.ts` which is a general way of getting an entire thread (had this in other code before)
- work on the value proposition of socialdatapod...
- ✅ ensure it keeps refreshing every 15 minutes
