# Contributing to exF

Thanks for helping keep exF alive — X changes its frontend constantly,
so even small selector fixes are valuable contributions.

## Dev setup

1. Clone the repo
2. Open `chrome://extensions`, enable **Developer mode**, **Load
   unpacked** → select the repo folder
3. Visit x.com — tag chips appear on user cells/profiles, the folder
   bar appears on the Bookmarks page

## Live reload

```
node tools/dev-server.js
```

While this runs, any change to `src/`, `icons/`, or `manifest.json`
auto-reloads the extension and refreshes open X tabs — no manual ↻
needed. The reload hook only activates in unpacked builds (store builds
have an `update_url`, which disables the whole block), and the dev
server binds to `127.0.0.1` only.

## Code layout

```
manifest.json
icons/                     # generated from logo.jpg
src/
  common/
    constants.js           # window.exF namespace, 9-color palette
    storage.js             # chrome.storage schema + CRUD
  content/
    main.js                # SPA router (MutationObserver + URL watch)
    tagger.js              # tag chips on user cells & profiles
    bookmarks.js           # nested folder bar + filtering on /i/bookmarks
    content.css
  popup/                   # manage tags/folders, JSON backup
  background/
    service-worker.js      # seeds defaults; dev auto-reload
tools/
  dev-server.js            # zero-dependency live-reload watcher
```

Content scripts can't use ES modules, so shared code hangs off the
`window.exF` namespace; load order is defined in `manifest.json`.

## Storage schema (v1)

```js
{
  schemaVersion: 1,
  tags:            { [tagId]: { id, name, color, createdAt } },
  userTags:        { [handleLower]: [tagId, ...] },
  folders:         { [folderId]: { id, name, parentId|null, createdAt,
                                   nativeId? } }, // nativeId = placement of an X folder
  bookmarkFolders: { [tweetId]: folderId },   // mapping only — bookmarks never leave X
  bookmarkMeta:    { [tweetId]: { author, name, text, url, addedAt } },
  settings:        { taggingEnabled, folderBarCollapsed },
}
```

## Ground rules

- **Selectors**: anchor on X's `data-testid` attributes, never on
  generated class names — testids survive redesigns far better.
- **No network calls to X**: exF only reads what X has already rendered
  for the logged-in user.
- **User data stays local**: nothing leaves the browser.
- **License**: contributions are accepted under AGPL-3.0.
