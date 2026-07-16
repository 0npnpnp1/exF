# exF — extend Folder (v1.0)

Chrome extension that extends X/Twitter with:

1. **Color tags on people you follow** — sort who you follow into your own
   tags (9 native colors matched to X's palette), applied right on user
   lists and profiles as you browse.
2. **Nested bookmark folders** — folders inside folders (iOS-gallery
   style) on `x.com/i/bookmarks`. exF's folder tree is its own overlay,
   stored entirely in your browser — it doesn't use or modify X's
   bookmark-folders system.

Brand color: `#7291BF` (from [logo.jpg](logo.jpg)).

## Install (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Visit x.com — tag chips appear on user cells/profiles, the folder bar
   appears on the Bookmarks page.

## Architecture decisions (v1.0)

| Decision | Choice |
| --- | --- |
| Data access | Incremental DOM scraping (anchored on `data-testid`, not class names) — no API keys, user sorts as they browse |
| Storage | `chrome.storage.local` only; JSON export/import as backup |
| Accounts | None yet — Supabase (Sign in with X) planned for cross-device sync/sharing later |
| Targets | `x.com` + `twitter.com`, Chrome only, Manifest V3 |
| Promo | Sliding/fading folder-page effect is **promo video only**, not in-app UI |

## Layout

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
    service-worker.js      # seeds defaults; future Supabase auth home
```

## Storage schema (v1.0)

```js
{
  schemaVersion: 1,
  tags:            { [tagId]: { id, name, color, createdAt } },
  userTags:        { [handleLower]: [tagId, ...] },
  folders:         { [folderId]: { id, name, parentId|null, createdAt } },
  bookmarkFolders: { [tweetId]: folderId },   // mapping only — bookmarks never leave X
}
```

## Known v1.0 limitations / next steps

- Folder rename/delete and bookmark moving use `prompt()` dialogs —
  replace with proper injected UI.
- Selectors depend on X's `data-testid` attributes; if X renames them,
  `tagger.js` / `bookmarks.js` need patching.
- Folder filtering only applies to bookmarks currently rendered in the
  virtualized timeline (scroll to load more).
- Supabase auth + sync not wired yet (account: Sign in with X planned).

## License

[AGPL-3.0](LICENSE) — free to use, modify, and redistribute; forks and
hosted services built on this code must publish their source under the
same license.
