// Nested-folder overlay for x.com/i/bookmarks.
//
// X's own bookmark folders are Premium-only and flat. exF stores its own
// folder tree (any depth) in chrome.storage and filters the bookmarks
// timeline client-side. Bookmarks themselves never leave X — we only map
// tweetId -> folderId.
window.exF = window.exF || {};

(() => {
  const { storage } = window.exF;

  let mounted = false;
  let currentFolderId = null; // null = root ("All bookmarks")
  let visibleIds = null; // Set of tweetIds to show, or null = show all

  const isBookmarksPage = () => /^\/i\/bookmarks/.test(location.pathname);

  function tweetIdFromArticle(article) {
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return null;
    const m = /\/status\/(\d+)/.exec(link.getAttribute("href"));
    return m ? m[1] : null;
  }

  // ---- folder bar ----

  async function renderBar() {
    const bar = document.querySelector(".exf-folderbar");
    if (!bar) return;
    bar.textContent = "";

    // Breadcrumb
    const crumbs = document.createElement("div");
    crumbs.className = "exf-crumbs";
    const rootBtn = document.createElement("button");
    rootBtn.className = "exf-crumb";
    rootBtn.textContent = "All bookmarks";
    rootBtn.addEventListener("click", () => enterFolder(null));
    crumbs.appendChild(rootBtn);
    if (currentFolderId) {
      const path = await storage.getFolderPath(currentFolderId);
      for (const f of path) {
        const sep = document.createElement("span");
        sep.className = "exf-crumb-sep";
        sep.textContent = "›";
        crumbs.appendChild(sep);
        const b = document.createElement("button");
        b.className = "exf-crumb";
        b.textContent = f.name;
        b.addEventListener("click", () => enterFolder(f.id));
        crumbs.appendChild(b);
      }
    }
    bar.appendChild(crumbs);

    // Child folders grid
    const grid = document.createElement("div");
    grid.className = "exf-foldergrid";
    const children = await storage.getChildFolders(currentFolderId);
    for (const f of children) {
      const tile = document.createElement("button");
      tile.className = "exf-folder";
      tile.innerHTML = `<span class="exf-folder-icon">📁</span>`;
      const label = document.createElement("span");
      label.textContent = f.name;
      tile.appendChild(label);
      tile.addEventListener("click", () => enterFolder(f.id));
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        folderMenu(f);
      });
      grid.appendChild(tile);
    }
    const newBtn = document.createElement("button");
    newBtn.className = "exf-folder exf-folder-new";
    newBtn.innerHTML = `<span class="exf-folder-icon">＋</span>`;
    const nl = document.createElement("span");
    nl.textContent = "New folder";
    newBtn.appendChild(nl);
    newBtn.addEventListener("click", async () => {
      const name = prompt("Folder name:");
      if (!name || !name.trim()) return;
      await storage.createFolder(name, currentFolderId);
      renderBar();
    });
    grid.appendChild(newBtn);
    bar.appendChild(grid);
  }

  function folderMenu(folder) {
    const action = prompt(
      `Folder "${folder.name}" — type "rename" or "delete":`
    );
    if (action === "rename") {
      const name = prompt("New name:", folder.name);
      if (name && name.trim())
        storage.renameFolder(folder.id, name).then(renderBar);
    } else if (action === "delete") {
      if (
        confirm(
          `Delete "${folder.name}" and its subfolders? Bookmarks stay on X, they just become unsorted.`
        )
      )
        storage.deleteFolder(folder.id).then(() => {
          if (currentFolderId === folder.id) currentFolderId = null;
          refreshFilter();
          renderBar();
        });
    }
  }

  async function enterFolder(folderId) {
    currentFolderId = folderId;
    await refreshFilter();
    renderBar();
    // Jump back to the top of the timeline when switching folders.
    document
      .querySelector('[data-testid="primaryColumn"]')
      ?.scrollIntoView({ block: "start" });
  }

  async function refreshFilter() {
    if (currentFolderId === null) {
      visibleIds = null;
    } else {
      const subtree = await storage.getFolderSubtreeIds(currentFolderId);
      const { bookmarkFolders } = await storage.getAll();
      visibleIds = new Set(
        Object.entries(bookmarkFolders)
          .filter(([, fId]) => subtree.has(fId))
          .map(([tweetId]) => tweetId)
      );
    }
    applyFilter();
  }

  function applyFilter() {
    if (!isBookmarksPage()) return;
    document
      .querySelectorAll('article[data-testid="tweet"]')
      .forEach((article) => {
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        if (!cell) return;
        if (visibleIds === null) {
          cell.classList.remove("exf-hidden");
          return;
        }
        const id = tweetIdFromArticle(article);
        cell.classList.toggle("exf-hidden", !id || !visibleIds.has(id));
      });
  }

  // ---- per-tweet "move to folder" button ----

  async function injectTweetButtons() {
    if (!isBookmarksPage()) return;
    const articles = document.querySelectorAll(
      'article[data-testid="tweet"]:not([data-exf-btn])'
    );
    for (const article of articles) {
      const id = tweetIdFromArticle(article);
      if (!id) continue;
      article.dataset.exfBtn = "1";
      const btn = document.createElement("button");
      btn.className = "exf-movebtn";
      btn.textContent = "📁";
      btn.title = "Move to exF folder";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await moveDialog(id);
      });
      article.style.position = "relative";
      article.appendChild(btn);
    }
  }

  // Minimal v1 mover: flat prompt listing full folder paths.
  async function moveDialog(tweetId) {
    const { folders } = await storage.getAll();
    const all = Object.values(folders);
    if (all.length === 0) {
      alert("No folders yet — create one from the folder bar first.");
      return;
    }
    const paths = [];
    for (const f of all) {
      const path = await storage.getFolderPath(f.id);
      paths.push({ id: f.id, label: path.map((p) => p.name).join(" / ") });
    }
    paths.sort((a, b) => a.label.localeCompare(b.label));
    const current = await storage.getBookmarkFolder(tweetId);
    const menu = paths
      .map((p, i) => `${i + 1}. ${p.label}${p.id === current ? "  ←" : ""}`)
      .join("\n");
    const answer = prompt(
      `Move bookmark to folder (number), or 0 to unsort:\n\n${menu}`
    );
    if (answer === null) return;
    const n = parseInt(answer, 10);
    if (n === 0) await storage.assignBookmark(tweetId, null);
    else if (n >= 1 && n <= paths.length)
      await storage.assignBookmark(tweetId, paths[n - 1].id);
    refreshFilter();
  }

  // ---- mount / unmount ----

  function mount() {
    if (!isBookmarksPage()) return;
    injectTweetButtons();
    applyFilter();
    if (mounted && document.querySelector(".exf-folderbar")) return;

    const column = document.querySelector('[data-testid="primaryColumn"]');
    if (!column) return;
    // Insert the bar right under the sticky page header.
    const header = column.querySelector("div"); // header block
    if (!header) return;

    const bar = document.createElement("div");
    bar.className = "exf-folderbar";
    header.insertAdjacentElement("afterend", bar);
    mounted = true;
    renderBar();
  }

  function unmount() {
    document.querySelector(".exf-folderbar")?.remove();
    document
      .querySelectorAll(".exf-hidden")
      .forEach((el) => el.classList.remove("exf-hidden"));
    mounted = false;
    currentFolderId = null;
    visibleIds = null;
  }

  function onNavigate() {
    if (isBookmarksPage()) mount();
    else unmount();
  }

  storage.onChange((changes) => {
    if (changes.folders || changes.bookmarkFolders) {
      if (mounted) {
        renderBar();
        refreshFilter();
      }
    }
  });

  window.exF.bookmarks = { mount, unmount, onNavigate };
})();
