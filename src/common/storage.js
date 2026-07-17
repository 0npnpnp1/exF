// Storage layer over chrome.storage.local. Everything lives under the
// keys in DEFAULTS. bookmarkFolders only maps tweetId -> folderId, the
// actual bookmarks never leave X.
window.exF = window.exF || {};

(() => {
  const DEFAULTS = {
    schemaVersion: window.exF.SCHEMA_VERSION || 1,
    tags: {},
    userTags: {},
    folders: {},
    bookmarkFolders: {},
    bookmarkMeta: {},
    settings: {
      taggingEnabled: true,
      folderBarCollapsed: false,
      hideNativeFolders: false,
    },
  };

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function getAll() {
    try {
      return await chrome.storage.local.get(DEFAULTS);
    } catch {
      // orphaned content script after an extension reload, serve
      // defaults so render code doesn't spam "context invalidated".
      // Read-only callers only, mutations go through getForUpdate.
      return structuredClone(DEFAULTS);
    }
  }

  // Like getAll but returns null when storage is unreadable. Mutations
  // and export need to tell "empty" apart from "can't read", otherwise
  // they end up writing defaults over real data.
  async function getAllStrict() {
    try {
      return await chrome.storage.local.get(DEFAULTS);
    } catch {
      return null;
    }
  }
  const getForUpdate = getAllStrict;

  async function set(patch) {
    try {
      await chrome.storage.local.set(patch);
    } catch {
      // orphaned context, drop the write. tab refresh brings fresh scripts
    }
  }

  // Full replace, for backup import. Write first, then remove leftover
  // keys. Clearing first would nuke the store if the write failed.
  // Talks to chrome.storage directly so errors reach the import UI.
  async function replaceAll(data) {
    const full = { ...structuredClone(DEFAULTS), ...data };
    const existing = await chrome.storage.local.get(null);
    await chrome.storage.local.set(full);
    const stale = Object.keys(existing).filter((k) => !(k in full));
    if (stale.length) await chrome.storage.local.remove(stale);
  }

  // tags

  async function createTag(name, color) {
    const data = await getForUpdate();
    if (!data) return null;
    const { tags } = data;
    const tag = { id: uid(), name: name.trim(), color, createdAt: Date.now() };
    tags[tag.id] = tag;
    await set({ tags });
    return tag;
  }

  async function updateTag(tagId, patch) {
    const data = await getForUpdate();
    if (!data) return null;
    const { tags } = data;
    if (!tags[tagId]) return null;
    Object.assign(tags[tagId], patch);
    await set({ tags });
    return tags[tagId];
  }

  async function deleteTag(tagId) {
    const data = await getForUpdate();
    if (!data) return;
    const { tags, userTags } = data;
    delete tags[tagId];
    for (const handle of Object.keys(userTags)) {
      userTags[handle] = userTags[handle].filter((id) => id !== tagId);
      if (userTags[handle].length === 0) delete userTags[handle];
    }
    await set({ tags, userTags });
  }

  async function getTagsForUser(handle) {
    const { tags, userTags } = await getAll();
    const ids = userTags[handle.toLowerCase()] || [];
    return ids.map((id) => tags[id]).filter(Boolean);
  }

  async function toggleUserTag(handle, tagId) {
    const key = handle.toLowerCase();
    const data = await getForUpdate();
    if (!data) return;
    const { userTags } = data;
    const current = userTags[key] || [];
    if (current.includes(tagId)) {
      userTags[key] = current.filter((id) => id !== tagId);
      if (userTags[key].length === 0) delete userTags[key];
    } else {
      userTags[key] = [...current, tagId];
    }
    await set({ userTags });
  }

  // folders (nested via parentId)

  async function createFolder(name, parentId = null) {
    const data = await getForUpdate();
    if (!data) return null;
    const { folders } = data;
    // parent may have been deleted from another tab meanwhile
    if (parentId !== null && !folders[parentId]) return null;
    const folder = {
      id: uid(),
      name: name.trim(),
      parentId,
      createdAt: Date.now(),
    };
    folders[folder.id] = folder;
    await set({ folders });
    return folder;
  }

  async function renameFolder(folderId, name) {
    const data = await getForUpdate();
    if (!data) return null;
    const { folders } = data;
    if (!folders[folderId]) return null;
    folders[folderId].name = name.trim();
    await set({ folders });
    return folders[folderId];
  }

  // Deletes the folder and all descendants. Bookmarks inside just
  // become unsorted, nothing is deleted on X.
  async function deleteFolder(folderId) {
    const data = await getForUpdate();
    if (!data) return;
    const { folders, bookmarkFolders, bookmarkMeta } = data;
    const doomed = new Set([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of Object.values(folders)) {
        if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
          doomed.add(f.id);
          grew = true;
        }
      }
    }
    for (const id of doomed) delete folders[id];
    for (const [tweetId, fId] of Object.entries(bookmarkFolders)) {
      if (doomed.has(fId)) {
        delete bookmarkFolders[tweetId];
        delete bookmarkMeta[tweetId];
      }
    }
    await set({ folders, bookmarkFolders, bookmarkMeta });
  }

  // Re-parent a folder, null = top level. Refuses cycles.
  async function moveFolder(folderId, newParentId) {
    const data = await getForUpdate();
    if (!data) return null;
    const { folders } = data;
    if (!folders[folderId]) return null;
    if (newParentId !== null) {
      if (!folders[newParentId]) return null;
      let cur = folders[newParentId];
      while (cur) {
        if (cur.id === folderId) return null; // cycle
        cur = cur.parentId ? folders[cur.parentId] : null;
      }
    }
    folders[folderId].parentId = newParentId;
    await set({ folders });
    return folders[folderId];
  }

  // Folders with a nativeId are placements of X's own (Premium) bookmark
  // folders inside our tree. We only store the pointer, X's folder is
  // never touched.

  async function findNativeFolder(nativeId) {
    const { folders } = await getAll();
    return Object.values(folders).find((f) => f.nativeId === nativeId) || null;
  }

  async function fileNativeFolder(nativeId, name, parentId) {
    const data = await getForUpdate();
    if (!data) return null;
    const { folders } = data;
    // parent may be gone, same as createFolder
    if (parentId != null && !folders[parentId]) return null;
    let entry = Object.values(folders).find((f) => f.nativeId === nativeId);
    if (entry) {
      entry.parentId = parentId;
      if (name) entry.name = name.trim();
    } else {
      entry = {
        id: uid(),
        name: (name || "X folder").trim(),
        parentId,
        createdAt: Date.now(),
        nativeId,
      };
      folders[entry.id] = entry;
    }
    await set({ folders });
    return entry;
  }

  async function getChildFolders(parentId = null) {
    const { folders } = await getAll();
    return Object.values(folders)
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // [root...folder], for breadcrumbs
  async function getFolderPath(folderId) {
    const { folders } = await getAll();
    const path = [];
    let cur = folders[folderId];
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? folders[cur.parentId] : null;
    }
    return path;
  }

  // folderId + all descendant ids
  async function getFolderSubtreeIds(folderId) {
    const { folders } = await getAll();
    const ids = new Set([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of Object.values(folders)) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    return ids;
  }

  // bookmark -> folder assignment. meta is captured at filing time so
  // folder views can render without X's timeline; moves without meta
  // keep whatever was stored.

  async function assignBookmark(tweetId, folderId, meta) {
    const data = await getForUpdate();
    if (!data) return;
    const { bookmarkFolders, bookmarkMeta } = data;
    if (folderId === null) {
      delete bookmarkFolders[tweetId];
      delete bookmarkMeta[tweetId];
    } else {
      bookmarkFolders[tweetId] = folderId;
      if (meta) bookmarkMeta[tweetId] = meta;
    }
    await set({ bookmarkFolders, bookmarkMeta });
  }

  async function getBookmarkFolder(tweetId) {
    const { bookmarkFolders } = await getAll();
    return bookmarkFolders[tweetId] || null;
  }

  // bookmarks in a folder incl. subfolders, newest first
  async function getFolderBookmarks(folderId) {
    const ids = await getFolderSubtreeIds(folderId);
    const { bookmarkFolders, bookmarkMeta } = await getAll();
    return Object.entries(bookmarkFolders)
      .filter(([, fId]) => ids.has(fId))
      .map(([tweetId, fId]) => ({
        tweetId,
        folderId: fId,
        meta: bookmarkMeta[tweetId] || null,
      }))
      .sort((a, b) => (b.meta?.addedAt || 0) - (a.meta?.addedAt || 0));
  }

  async function getSettings() {
    const { settings } = await getAll();
    return { ...DEFAULTS.settings, ...settings };
  }

  async function updateSettings(patch) {
    const data = await getForUpdate();
    if (!data) return null;
    const settings = { ...DEFAULTS.settings, ...data.settings, ...patch };
    await set({ settings });
    return settings;
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") callback(changes);
    });
  }

  window.exF.storage = {
    getAll,
    getAllStrict,
    replaceAll,
    createTag,
    updateTag,
    deleteTag,
    getTagsForUser,
    toggleUserTag,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    findNativeFolder,
    fileNativeFolder,
    getChildFolders,
    getFolderPath,
    getFolderSubtreeIds,
    assignBookmark,
    getBookmarkFolder,
    getFolderBookmarks,
    getSettings,
    updateSettings,
    onChange,
  };
})();
