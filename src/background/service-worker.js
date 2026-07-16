// Minimal MV3 service worker. For v1 it only seeds defaults on install;
// later this is where Supabase auth/session handling will live.

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const existing = await chrome.storage.local.get("schemaVersion");
    if (!existing.schemaVersion) {
      await chrome.storage.local.set({
        schemaVersion: 1,
        tags: {},
        userTags: {},
        folders: {},
        bookmarkFolders: {},
      });
    }
  }
});
