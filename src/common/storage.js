// Storage layer over chrome.storage.local.
//
// Schema (schemaVersion 1):
//   tags:        { [tagId]: { id, name, color, createdAt } }
//   userTags:    { [handleLower]: [tagId, ...] }
//   folders:     { [folderId]: { id, name, parentId|null, createdAt } }
//   bookmarkFolders: { [tweetId]: folderId }
window.exF = window.exF || {};

(() => {
  const DEFAULTS = {
    schemaVersion: window.exF.SCHEMA_VERSION || 1,
    tags: {},
    userTags: {},
    folders: {},
    bookmarkFolders: {},
  };

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function getAll() {
    const data = await chrome.storage.local.get(DEFAULTS);
    return data;
  }

  async function set(patch) {
    await chrome.storage.local.set(patch);
  }

  // ---- Tags ----

  async function createTag(name, color) {
    const { tags } = await getAll();
    const tag = { id: uid(), name: name.trim(), color, createdAt: Date.now() };
    tags[tag.id] = tag;
    await set({ tags });
    return tag;
  }

  async function updateTag(tagId, patch) {
    const { tags } = await getAll();
    if (!tags[tagId]) return null;
    Object.assign(tags[tagId], patch);
    await set({ tags });
    return tags[tagId];
  }

  async function deleteTag(tagId) {
    const { tags, userTags } = await getAll();
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
    const { userTags } = await getAll();
    const current = userTags[key] || [];
    if (current.includes(tagId)) {
      userTags[key] = current.filter((id) => id !== tagId);
      if (userTags[key].length === 0) delete userTags[key];
    } else {
      userTags[key] = [...current, tagId];
    }
    await set({ userTags });
  }

  // ---- Folders (nested via parentId) ----

  async function createFolder(name, parentId = null) {
    const { folders } = await getAll();
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
    const { folders } = await getAll();
    if (!folders[folderId]) return null;
    folders[folderId].name = name.trim();
    await set({ folders });
    return folders[folderId];
  }

  // Deletes a folder and all its descendants; bookmarks inside are
  // released back to "unsorted" (assignment removed), not deleted from X.
  async function deleteFolder(folderId) {
    const { folders, bookmarkFolders } = await getAll();
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
      if (doomed.has(fId)) delete bookmarkFolders[tweetId];
    }
    await set({ folders, bookmarkFolders });
  }

  async function getChildFolders(parentId = null) {
    const { folders } = await getAll();
    return Object.values(folders)
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Returns [root...folder] path for breadcrumbs.
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

  // Set of folderId + all descendant ids (for "show folder contents
  // including subfolders" filtering).
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

  // ---- Bookmark → folder assignment ----

  async function assignBookmark(tweetId, folderId) {
    const { bookmarkFolders } = await getAll();
    if (folderId === null) delete bookmarkFolders[tweetId];
    else bookmarkFolders[tweetId] = folderId;
    await set({ bookmarkFolders });
  }

  async function getBookmarkFolder(tweetId) {
    const { bookmarkFolders } = await getAll();
    return bookmarkFolders[tweetId] || null;
  }

  // ---- Change subscription (re-render UI when popup edits data, etc.) ----

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") callback(changes);
    });
  }

  window.exF.storage = {
    getAll,
    createTag,
    updateTag,
    deleteTag,
    getTagsForUser,
    toggleUserTag,
    createFolder,
    renameFolder,
    deleteFolder,
    getChildFolders,
    getFolderPath,
    getFolderSubtreeIds,
    assignBookmark,
    getBookmarkFolder,
    onChange,
  };
})();
