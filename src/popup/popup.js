// Popup: manage tags & folders, JSON backup. Uses the same
// constants.js/storage.js globals as the content scripts.
const { storage, COLORS } = window.exF;

// ---- tabs ----

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("on"));
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("on"));
    tab.classList.add("on");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("on");
  });
});

// ---- tags pane ----

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
    row.className = "row";
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
    del.addEventListener("click", async () => {
      if (confirm(`Delete tag "${tag.name}"? It will be removed from all users.`)) {
        await storage.deleteTag(tag.id);
        renderTags();
      }
    });
    row.appendChild(del);
    list.appendChild(row);
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

// ---- folders pane ----

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
      const row = document.createElement("div");
      row.className = "row";
      for (let i = 0; i < depth; i++) {
        const pad = document.createElement("span");
        pad.className = "indent";
        row.appendChild(pad);
      }
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `📁 ${f.name}`;
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
      add.addEventListener("click", async () => {
        const sub = prompt(`Subfolder inside "${f.name}":`);
        if (sub && sub.trim()) {
          await storage.createFolder(sub, f.id);
          renderFolders();
        }
      });
      row.appendChild(add);
      const del = document.createElement("button");
      del.className = "x";
      del.textContent = "✕";
      del.title = "Delete folder";
      del.addEventListener("click", async () => {
        if (confirm(`Delete "${f.name}" and its subfolders? Bookmarks stay on X.`)) {
          await storage.deleteFolder(f.id);
          renderFolders();
        }
      });
      row.appendChild(del);
      tree.appendChild(row);
      renderLevel(f.id, depth + 1);
    }
  }
  renderLevel("__root__", 0);
}

document.getElementById("folder-create").addEventListener("click", async () => {
  const input = document.getElementById("folder-name");
  const name = input.value.trim();
  if (!name) return;
  await storage.createFolder(name, null);
  input.value = "";
  renderFolders();
});

// ---- backup pane ----

document.getElementById("export").addEventListener("click", async () => {
  const data = await storage.getAll();
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
    await chrome.storage.local.set(data);
    status.textContent = "Backup restored.";
    renderTags();
    renderFolders();
  } catch (err) {
    status.textContent = `Import failed: ${err.message}`;
  }
});

// ---- init ----

buildSwatches();
renderTags();
renderFolders();
