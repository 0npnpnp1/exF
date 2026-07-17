// Keep in sync with constants.js (can't import it here, it targets
// window).
const SCHEMA_VERSION = 2;
const LEGACY_COLORS = { green: "mint", purple: "lavender" };

chrome.runtime.onInstalled.addListener(async (details) => {
  const { schemaVersion, tags, folders } = await chrome.storage.local.get([
    "schemaVersion",
    "tags",
    "folders",
  ]);

  // Seed only on a genuinely fresh install. schemaVersion is only ever
  // written here, so old data might not have it, and reseeding on
  // update would wipe it.
  if (details.reason === "install" && !schemaVersion && !tags && !folders) {
    await chrome.storage.local.set({
      schemaVersion: SCHEMA_VERSION,
      tags: {},
      userTags: {},
      folders: {},
      bookmarkFolders: {},
      settings: { taggingEnabled: true },
    });
    return;
  }

  // migrations (unstamped data counts as v1)
  if ((schemaVersion || 1) < 2) {
    // v1 -> v2: green/purple were renamed to mint/lavender
    const migrated = tags || {};
    for (const tag of Object.values(migrated)) {
      if (LEGACY_COLORS[tag.color]) tag.color = LEGACY_COLORS[tag.color];
    }
    await chrome.storage.local.set({ schemaVersion: 2, tags: migrated });
  }
});

// Dev auto-reload, unpacked builds only. Long-polls tools/dev-server.js
// and reloads the extension (plus open X tabs) when a file changes.
// Store builds have an update_url so this never runs there.
const IS_DEV = !("update_url" in chrome.runtime.getManifest());
const DEV_POLL = "http://127.0.0.1:8890/poll";

async function reloadXTabs() {
  const tabs = await chrome.tabs.query({
    url: ["https://x.com/*", "https://twitter.com/*"],
  });
  for (const tab of tabs) chrome.tabs.reload(tab.id);
}

async function devReloadLoop() {
  let since = 0;
  for (;;) {
    try {
      const res = await fetch(`${DEV_POLL}?since=${since}`);
      const { version } = await res.json();
      if (since && version > since) {
        await chrome.storage.local.set({ devReloadPending: true });
        chrome.runtime.reload();
        return;
      }
      since = version;
    } catch {
      // dev server not running, retry quietly
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

if (IS_DEV) {
  chrome.storage.local.get("devReloadPending").then(({ devReloadPending }) => {
    if (devReloadPending) {
      chrome.storage.local.remove("devReloadPending");
      reloadXTabs();
    }
  });
  devReloadLoop();
}
