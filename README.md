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

## Install

Until the Chrome Web Store listing is live:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Visit x.com — tag chips appear on user cells/profiles, the folder bar
   appears on the Bookmarks page.

## Privacy

Everything stays in your browser: exF makes no network requests, only
reads what X has already rendered for you, and stores tags/folders in
`chrome.storage.local`. Use the popup's **Backup** tab to export/import
your data as JSON.

## Using X on multiple devices

exF never writes to X — filing a bookmark into a folder only records a
note inside your browser. Your actual X bookmarks stay untouched, so
the mobile app (and every other device) sees exactly what it always
did. In practice:

- **Bookmark on your phone** -> it shows up on web in *All bookmarks*,
  unsorted, ready to be filed.
- **Remove a bookmark on your phone** (or the author deletes the post)
  -> nothing breaks; exF just keeps a harmless stale entry, so folder
  counts can drift slightly over time.
- **Tags and folders are visible only where exF is installed** — the
  mobile app can't run extensions. Cross-device sync via an optional
  exF account is on the roadmap.
- **Two computers** -> two separate folder trees for now; carry data
  over with the popup's JSON export/import until sync lands.
- **Multiple X accounts in one browser** share one exF dataset for now
  — per-account separation is planned.

## Architecture decisions (v1.0)

| Decision | Choice |
| --- | --- |
| Data access | Incremental DOM scraping (anchored on `data-testid`, not class names) — no API keys, user sorts as they browse |
| Storage | `chrome.storage.local` only; JSON export/import as backup |
| Accounts | None yet — Supabase (Sign in with X) planned for cross-device sync/sharing later |
| Targets | `x.com` + `twitter.com`, Chrome only, Manifest V3 |

## Known v1.0 limitations / next steps

- Folder rename/delete and bookmark moving use `prompt()` dialogs —
  replace with proper injected UI.
- Selectors depend on X's `data-testid` attributes; if X renames them,
  `tagger.js` / `bookmarks.js` need patching.
- Folder views render from metadata captured when a bookmark is filed;
  bookmarks filed before this feature show as bare post links until
  re-filed.
- Supabase auth + sync not wired yet (account: Sign in with X planned).
- No cleanup of stale bookmark mappings yet (a "clean stale entries"
  maintenance action is a good v1.1 candidate).
- exF data isn't namespaced per X account — switching accounts in the
  same browser mixes tag/folder views (v1.1 candidate).

## Contributing

Dev setup, live reload, code layout, and ground rules live in
[CONTRIBUTING.md](CONTRIBUTING.md). Selector fixes are always welcome —
X redesigns often.

## License

[AGPL-3.0](LICENSE) — free to use, modify, and redistribute; forks and
hosted services built on this code must publish their source under the
same license.
