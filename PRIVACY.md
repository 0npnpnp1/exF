# exF Privacy Policy

Last updated: July 17, 2026

exF ("extend Folder") is a browser extension that adds color tags for
followed accounts and nested bookmark folders to the X/Twitter web
interface.

## Data

All data exF creates or reads stays on your device:

- Tags you create, tag-to-account assignments, your folder tree, and
  bookmark-to-folder mappings are stored locally in your browser via
  `chrome.storage.local`.
- When you file a bookmark into a folder, a small display snippet
  (author handle, display name, a short text excerpt, post URL) is
  captured from the page you are viewing and stored locally so folder
  views can render it.

exF has no server. It makes no network requests, collects no analytics
or telemetry, and does not transmit, sell, or share any data with
anyone. It does not read cookies, passwords, messages, or anything
beyond what the X page already displays to you.

The popup's Backup tab can export your data as a JSON file to your own
computer, and import it back. That file never leaves your device unless
you move it yourself.

## Permissions

- `storage`: to save your tags and folders locally.
- Host access to `x.com` / `twitter.com`: to display tag chips and the
  folder bar inside X pages. The extension only reads what the page
  already shows to you while logged in.

## Removal

Uninstalling the extension deletes its locally stored data. You can
also export it first from the popup's Backup tab.

## Contact

Questions: open an issue on the project repository.
