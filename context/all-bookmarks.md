Based on the provided context, here are all relevant URLs for bookmarks:

## API Specification URLs

- **Delete Bookmark**: https://oapis.org/openapi/x/deleteUsersBookmark
- **Get Bookmarks**: https://oapis.org/openapi/x/getUsersBookmarks
- **Get Bookmark Folders**: https://oapis.org/openapi/x/getUsersBookmarkFolders
- **Get Bookmarks by Folder ID**: https://oapis.org/openapi/x/getUsersBookmarksByFolderId
- **Create Bookmark**: https://oapis.org/openapi/x/createUsersBookmark

## Documentation URLs

- **Integration Guide**: https://docs.x.com/x-api/posts/bookmarks/integrate.md
- **Bookmarks Introduction**: https://docs.x.com/x-api/posts/bookmarks/introduction.md
- **Bookmarks Lookup Quickstart**: https://docs.x.com/x-api/posts/bookmarks/quickstart/bookmarks-lookup.md
- **Manage Bookmarks Quickstart**: https://docs.x.com/x-api/posts/bookmarks/quickstart/manage-bookmarks.md
- **Create Bookmark Endpoint**: https://docs.x.com/x-api/users/create-bookmark.md
- **Delete Bookmark Endpoint**: https://docs.x.com/x-api/users/delete-bookmark.md
- **Get Bookmark Folders Endpoint**: https://docs.x.com/x-api/users/get-bookmark-folders.md
- **Get Bookmarks Endpoint**: https://docs.x.com/x-api/users/get-bookmarks.md
- **Get Bookmarks by Folder ID**: https://docs.x.com/x-api/bookmarks/get-bookmarks-by-folder-id.md
- **OAUTH**: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code.md

## Pricing Information

From the pricing table, bookmark endpoints have the following rate limits across tiers:

| Endpoint                                        | Pro                         | Basic                      | Free                       |
| ----------------------------------------------- | --------------------------- | -------------------------- | -------------------------- |
| `DELETE /2/users/:id/bookmarks/:tweet_id`       | 50 req/15min per user       | 5 req/15min per user       | 1 req/15min per user       |
| `GET /2/users/:id/bookmarks`                    | 180 req/15min per user      | 10 req/15min per user      | 1 req/15min per user       |
| `GET /2/users/:id/bookmarks/folders`            | 50 req/15min per user & app | 5 req/15min per user & app | 1 req/15min per user & app |
| `GET /2/users/:id/bookmarks/folders/:folder_id` | 50 req/15min per user & app | 5 req/15min per user & app | 1 req/15min per user & app |
| `POST /2/users/:id/bookmarks`                   | 50 req/15min per user       | 5 req/15min per user       | 1 req/15min per user       |
