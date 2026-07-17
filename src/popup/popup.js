// Popup: manage tags & folders, JSON backup. Shares constants.js and
// storage.js with the content scripts.
const { storage, COLORS } = window.exF;

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("on"));
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("on"));
    tab.classList.add("on");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("on");
  });
});

// tags pane

let pickedColor = "blue";

function buildSwatches() {
  const holder = document.getElementById("tag-swatches");
  for (const [key, hex] of Object.entries(COLORS)) {
    const sw = document.createElement("button");
    sw.className = "swatch" + (key === pickedColor ? " on" : "");
    sw.style.background = hex;
    sw.title = key;
    sw.addEventListener("click", () => {
      pickedColor = key;
      holder.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
      sw.classList.add("on");
    });
    holder.appendChild(sw);
  }
}

// rows currently unfolded, kept across re-renders
const expandedTags = new Set();
const expandedFolders = new Set();

async function renderTags() {
  const { tags, userTags } = await storage.getAll();
  const counts = {};
  for (const ids of Object.values(userTags))
    for (const id of ids) counts[id] = (counts[id] || 0) + 1;

  const list = document.getElementById("tag-list");
  list.textContent = "";
  const all = Object.values(tags).sort((a, b) => a.name.localeCompare(b.name));
  if (all.length === 0) {
    list.innerHTML = `<div class="empty">No tags yet — create one below, or from any profile on X.</div>`;
    return;
  }
  for (const tag of all) {
    const row = document.createElement("div");
    row.className = "row clickable";
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = expandedTags.has(tag.id) ? "▾" : "▸";
    row.appendChild(chev);
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = COLORS[tag.color] || COLORS.gray;
    row.appendChild(dot);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = tag.name;
    row.appendChild(name);
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${counts[tag.id] || 0} users`;
    row.appendChild(count);
    const del = document.createElement("button");
    del.className = "x";
    del.textContent = "✕";
    del.title = "Delete tag";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Delete tag "${tag.name}"? It will be removed from all users.`)) {
        await storage.deleteTag(tag.id);
        renderTags();
      }
    });
    row.appendChild(del);
    row.addEventListener("click", () => {
      if (expandedTags.has(tag.id)) expandedTags.delete(tag.id);
      else expandedTags.add(tag.id);
      renderTags();
    });
    // accept user rows dragged over from another tag
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("dragover");
    });
    row.addEventListener("dragleave", () => row.classList.remove("dragover"));
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("dragover");
      let payload;
      try {
        payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
      const { handle, from } = payload || {};
      if (!handle || !from || from === tag.id) return;
      const { userTags: current } = await storage.getAll();
      const has = current[handle] || [];
      if (!has.includes(tag.id)) {
        await storage.toggleUserTag(handle, tag.id); // add to target
      }
      // careful: toggleUserTag toggles, so only "remove" from the
      // source when the handle is actually still on it (stale payloads
      // would re-add it instead)
      if (has.includes(from)) {
        await storage.toggleUserTag(handle, from);
      }
      expandedTags.add(tag.id); // reveal the destination
      renderTags();
    });
    list.appendChild(row);

    // unfolded: the users carrying this tag
    if (expandedTags.has(tag.id)) {
      const handles = Object.entries(userTags)
        .filter(([, ids]) => ids.includes(tag.id))
        .map(([h]) => h)
        .sort();
      if (handles.length === 0) {
        const sub = document.createElement("div");
        sub.className = "subrow";
        const note = document.createElement("span");
        note.className = "count";
        note.textContent = "no users yet";
        sub.appendChild(note);
        list.appendChild(sub);
      }
      for (const h of handles) {
        const sub = document.createElement("div");
        sub.className = "subrow";
        sub.draggable = true;
        sub.addEventListener("dragstart", (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(
            "text/plain",
            JSON.stringify({ handle: h, from: tag.id })
          );
        });
        const a = document.createElement("a");
        a.href = `https://x.com/${h}`;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = `@${h}`;
        a.draggable = false; // let the row own the drag, not the link
        sub.appendChild(a);
        const un = document.createElement("button");
        un.className = "x";
        un.textContent = "✕";
        un.title = "Remove this tag from the user";
        un.addEventListener("click", async (e) => {
          e.stopPropagation();
          await storage.toggleUserTag(h, tag.id);
          renderTags();
        });
        sub.appendChild(un);
        list.appendChild(sub);
      }
    }
  }
}

document.getElementById("tag-create").addEventListener("click", async () => {
  const input = document.getElementById("tag-name");
  const name = input.value.trim();
  if (!name) return;
  await storage.createTag(name, pickedColor);
  input.value = "";
  renderTags();
});

// folders pane

async function renderFolders() {
  const { folders, bookmarkFolders } = await storage.getAll();
  const counts = {};
  for (const fId of Object.values(bookmarkFolders))
    counts[fId] = (counts[fId] || 0) + 1;

  const tree = document.getElementById("folder-tree");
  tree.textContent = "";
  const byParent = {};
  for (const f of Object.values(folders)) {
    const key = f.parentId || "__root__";
    (byParent[key] = byParent[key] || []).push(f);
  }
  for (const arr of Object.values(byParent))
    arr.sort((a, b) => a.name.localeCompare(b.name));

  if (!byParent.__root__) {
    tree.innerHTML = `<div class="empty">No folders yet.</div>`;
    return;
  }

  function renderLevel(parentKey, depth) {
    for (const f of byParent[parentKey] || []) {
      const hasKids = !!byParent[f.id];
      const row = document.createElement("div");
      row.className = "row" + (hasKids ? " clickable" : "");
      for (let i = 0; i < depth; i++) {
        const pad = document.createElement("span");
        pad.className = "indent";
        row.appendChild(pad);
      }
      const chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = hasKids
        ? expandedFolders.has(f.id)
          ? "▾"
          : "▸"
        : "";
      // mousedown on the chevron suspends the row drag so fold/unfold
      // keeps a pointer cursor
      chev.addEventListener("mousedown", () => {
        row.draggable = false;
      });
      row.addEventListener("mouseup", () => {
        row.draggable = true;
      });
      row.addEventListener("mouseleave", () => {
        row.draggable = true;
      });
      row.appendChild(chev);
      const icon = document.createElement("span");
      icon.className = "ficon";
      icon.innerHTML = window.exF.FOLDER_SVG;
      row.appendChild(icon);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = f.name;
      row.appendChild(name);
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = `${counts[f.id] || 0}`;
      count.title = "bookmarks in this folder";
      row.appendChild(count);
      const add = document.createElement("button");
      add.className = "x";
      add.textContent = "＋";
      add.title = "Add subfolder";
      add.addEventListener("click", async (e) => {
        e.stopPropagation();
        const sub = prompt(`Subfolder inside "${f.name}":`);
        if (sub && sub.trim()) {
          await storage.createFolder(sub, f.id);
          expandedFolders.add(f.id); // reveal the new subfolder
          renderFolders();
        }
      });
      row.appendChild(add);
      const del = document.createElement("button");
      del.className = "x";
      del.textContent = "✕";
      del.title = "Delete folder";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${f.name}" and its subfolders? Bookmarks stay on X.`)) {
          await storage.deleteFolder(f.id);
          renderFolders();
        }
      });
      row.appendChild(del);
      if (hasKids) {
        row.addEventListener("click", () => {
          if (expandedFolders.has(f.id)) expandedFolders.delete(f.id);
          else expandedFolders.add(f.id);
          renderFolders();
        });
      }
      // drag a folder onto another folder to nest it
      row.draggable = true;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ folderId: f.id })
        );
        // reveal the drop zone async, changing layout synchronously in
        // dragstart makes Chrome cancel the drag
        setTimeout(() => {
          document.body.classList.add("dragging-folder");
        }, 0);
      });
      row.addEventListener("dragend", () =>
        document.body.classList.remove("dragging-folder")
      );
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        row.classList.add("dragover");
      });
      row.addEventListener("dragleave", () =>
        row.classList.remove("dragover")
      );
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        row.classList.remove("dragover");
        document.body.classList.remove("dragging-folder");
        let payload;
        try {
          payload = JSON.parse(e.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
        if (!payload?.folderId || payload.folderId === f.id) return;
        const moved = await storage.moveFolder(payload.folderId, f.id);
        if (moved) {
          expandedFolders.add(f.id); // reveal the new child
          renderFolders();
        }
      });
      tree.appendChild(row);
      if (hasKids && expandedFolders.has(f.id)) renderLevel(f.id, depth + 1);
    }
  }
  renderLevel("__root__", 0);
}

// drop zone for un-nesting, visible only while a folder is dragged
const rootzone = document.getElementById("folder-rootzone");
rootzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  rootzone.classList.add("dragover");
});
rootzone.addEventListener("dragleave", () =>
  rootzone.classList.remove("dragover")
);
rootzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  rootzone.classList.remove("dragover");
  document.body.classList.remove("dragging-folder");
  let payload;
  try {
    payload = JSON.parse(e.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (!payload?.folderId) return;
  await storage.moveFolder(payload.folderId, null);
  renderFolders();
});

document.getElementById("folder-create").addEventListener("click", async () => {
  const input = document.getElementById("folder-name");
  const name = input.value.trim();
  if (!name) return;
  await storage.createFolder(name, null);
  input.value = "";
  renderFolders();
});

// backup pane

document.getElementById("export").addEventListener("click", async () => {
  // strict read: exporting defaults when storage is unreadable would
  // produce an empty backup that later restores as a wipe
  const data = await storage.getAllStrict();
  if (!data) {
    document.getElementById("backup-status").textContent =
      "Export failed: storage unavailable. Close and reopen the popup.";
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `exf-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("backup-status").textContent = "Backup downloaded.";
});

document.getElementById("import").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById("backup-status");
  try {
    const data = JSON.parse(await file.text());
    if (!data.schemaVersion || !data.tags || !data.folders) {
      throw new Error("not an exF backup");
    }
    if (!confirm("Importing replaces your current exF data. Continue?")) return;
    // v1 backups may use the old green/purple color keys
    if (data.schemaVersion < 2) {
      const legacy = window.exF.LEGACY_COLORS;
      for (const tag of Object.values(data.tags)) {
        if (legacy[tag.color]) tag.color = legacy[tag.color];
      }
      data.schemaVersion = window.exF.SCHEMA_VERSION;
    }
    await storage.replaceAll(data);
    status.textContent = "Backup restored.";
    renderTags();
    renderFolders();
  } catch (err) {
    status.textContent = `Import failed: ${err.message}`;
  }
});

// settings

const taggingToggle = document.getElementById("tagging-enabled");
storage.getSettings().then((s) => {
  taggingToggle.checked = s.taggingEnabled !== false;
});
taggingToggle.addEventListener("change", () => {
  storage.updateSettings({ taggingEnabled: taggingToggle.checked });
});

// init

buildSwatches();
renderTags();
renderFolders();

// live refresh while the popup is open (tagging on X etc)
storage.onChange((changes) => {
  if (changes.tags || changes.userTags) renderTags();
  if (changes.folders || changes.bookmarkFolders) renderFolders();
  if (changes.settings) {
    storage.getSettings().then((s) => {
      taggingToggle.checked = s.taggingEnabled !== false;
    });
  }
});
