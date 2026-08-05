// Nested folder overlay for x.com/i/bookmarks.
//
// X's own bookmark folders are Premium-only and flat. We keep our own
// tree in chrome.storage and filter the bookmarks timeline client-side.
// Bookmarks never leave X, we only map tweetId -> folderId.
window.exF = window.exF || {};

(() => {
  const { storage } = window.exF;

  let mounted = false;
  let currentFolderId = null; // null = root ("All bookmarks")
  // Cache of settings.folderBarCollapsed so applyFilter can stay sync.
  // It used to await getSettings and the timeline hid a beat after
  // renderBar painted, or overlapping calls landed out of order.
  let barCollapsed = false;
  // Same reason: applyNativeFolderVisibility runs on every DOM pass, so
  // it must not await a storage read each time.
  let hideNativeFolders = false;

  const isBookmarksPage = () => /^\/i\/bookmarks/.test(location.pathname);

  // /i/bookmarks/12345 is one of X's own (Premium) folders
  const nativeIdFromPath = () => {
    const m = /^\/i\/bookmarks\/(\d+)/.exec(location.pathname);
    return m ? m[1] : null;
  };

  function tweetIdFromArticle(article) {
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return null;
    const m = /\/status\/(\d+)/.exec(link.getAttribute("href"));
    return m ? m[1] : null;
  }

  // Guard against concurrent renders (button handler + storage listener
  // firing together), only the newest one gets to touch the bar.
  let renderSeq = 0;

  async function renderBar() {
    const bar = document.querySelector(".exf-folderbar");
    if (!bar) return;
    const seq = ++renderSeq;

    // fetch everything first, only touch the DOM after the awaits
    const path = currentFolderId
      ? await storage.getFolderPath(currentFolderId)
      : [];
    const children = await storage.getChildFolders(currentFolderId);
    const items = currentFolderId
      ? await storage.getFolderBookmarks(currentFolderId)
      : [];
    if (seq !== renderSeq || !bar.isConnected) return; // superseded

    // Toggle the timeline in the same sync block that paints the bar.
    // Doing it earlier blanks the page while the awaits run, later and
    // both UIs show at once.
    applyFilter();
    bar.textContent = "";

    // Drops: a post card ({tweetId}), a folder tile ({folderId}), or
    // one of X's native folder rows (dragged links, payload is the
    // /i/bookmarks/<id> url).
    function makeDropTarget(el, folderId) {
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        el.classList.add("exf-dragover");
      });
      el.addEventListener("dragleave", () =>
        el.classList.remove("exf-dragover")
      );
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove("exf-dragover");
        const text = e.dataTransfer.getData("text/plain");
        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch {
          // not JSON, probably a dragged link
        }
        if (payload?.tweetId) {
          await storage.assignBookmark(payload.tweetId, folderId);
          return;
        }
        if (payload?.folderId) {
          await storage.moveFolder(payload.folderId, folderId);
          return;
        }
        const m = /\/i\/bookmarks\/(\d+)/.exec(text);
        if (m) {
          const name =
            document
              .querySelector(`a[href="/i/bookmarks/${m[1]}"]`)
              ?.textContent?.trim() || "X folder";
          await storage.fileNativeFolder(m[1], name, folderId);
        }
      });
    }

    // breadcrumb
    const crumbs = document.createElement("div");
    crumbs.className = "exf-crumbs";
    const rootBtn = document.createElement("button");
    rootBtn.className = "exf-crumb";
    rootBtn.textContent = "All bookmarks";
    rootBtn.addEventListener("click", () => enterFolder(null));
    makeDropTarget(rootBtn, null); // drop on root = unsort
    crumbs.appendChild(rootBtn);
    if (currentFolderId) {
      for (const f of path) {
        const sep = document.createElement("span");
        sep.className = "exf-crumb-sep";
        sep.textContent = "›";
        crumbs.appendChild(sep);
        const b = document.createElement("button");
        b.className = "exf-crumb";
        b.textContent = f.name;
        b.addEventListener("click", () => enterFolder(f.id));
        // native placements are pointers, not containers, don't accept
        // bookmark drops (same rule as the tiles below)
        if (!f.nativeId) makeDropTarget(b, f.id);
        crumbs.appendChild(b);
      }
    }
    bar.appendChild(crumbs);

    // child folder grid
    const grid = document.createElement("div");
    grid.className = "exf-foldergrid";
    for (const f of children) {
      const tile = document.createElement("button");
      tile.className = "exf-folder";
      tile.innerHTML = `<span class="exf-folder-icon">${window.exF.FOLDER_SVG}</span>`;
      const label = document.createElement("span");
      label.textContent = f.nativeId ? `${f.name} ↗` : f.name;
      if (f.nativeId) tile.title = "X bookmark folder — opens X's view";
      tile.appendChild(label);
      tile.addEventListener("click", () => {
        // native placements open X's own folder page, the back-link
        // there returns to this spot in the tree
        if (f.nativeId) location.href = `/i/bookmarks/${f.nativeId}`;
        else enterFolder(f.id);
      });
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        folderMenu(f);
      });
      tile.draggable = true;
      tile.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ folderId: f.id })
        );
      });
      if (!f.nativeId) makeDropTarget(tile, f.id);
      grid.appendChild(tile);
    }
    const newBtn = document.createElement("button");
    newBtn.className = "exf-folder exf-folder-new";
    newBtn.innerHTML = `<span class="exf-folder-icon exf-folder-plus">＋</span>`;
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

    // inside a folder we render our own cards, X's timeline is hidden
    if (currentFolderId) {
      const list = document.createElement("div");
      list.className = "exf-contents";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "exf-card-empty";
        empty.textContent =
          "No bookmarks in this folder yet — go to All bookmarks and use a post's folder button to file it here.";
        list.appendChild(empty);
      }
      for (const it of items) {
        const card = document.createElement("div");
        card.className = "exf-card";
        card.draggable = true;
        card.addEventListener("dragstart", (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(
            "text/plain",
            JSON.stringify({ tweetId: it.tweetId })
          );
        });
        const link = document.createElement("a");
        link.className = "exf-card-link";
        link.href =
          it.meta?.url || `https://x.com/i/status/${it.tweetId}`;
        link.textContent = it.meta
          ? `@${it.meta.author || "?"}`
          : `Post ${it.tweetId}`;
        link.draggable = false; // the card owns the drag, not the link
        card.appendChild(link);
        if (it.meta?.text) {
          const text = document.createElement("div");
          text.className = "exf-card-text";
          text.textContent = it.meta.text;
          card.appendChild(text);
        }
        const actions = document.createElement("div");
        actions.className = "exf-card-actions";
        const move = document.createElement("button");
        move.className = "exf-card-btn";
        move.textContent = "move";
        move.addEventListener("click", () => moveDialog(it.tweetId, null));
        actions.appendChild(move);
        const unsort = document.createElement("button");
        unsort.className = "exf-card-btn";
        unsort.textContent = "unsort";
        unsort.addEventListener("click", async () => {
          await storage.assignBookmark(it.tweetId, null);
          renderBar();
        });
        actions.appendChild(unsort);
        card.appendChild(actions);
        list.appendChild(card);
      }
      bar.appendChild(list);
    }
  }

  // Grab enough post info at filing time to render folder views without
  // the timeline.
  function extractTweetMeta(article, tweetId) {
    // look for the handle inside the author block only, the first @span
    // in the whole article can be a retweeter or reply-context mention
    const authorBlock =
      article.querySelector('[data-testid="User-Name"]') || article;
    const handleSpan = [...authorBlock.querySelectorAll("span")].find((s) =>
      /^@[A-Za-z0-9_]{1,15}$/.test(s.textContent)
    );
    const handle = handleSpan ? handleSpan.textContent.slice(1) : null;
    const nameEl = article.querySelector('[data-testid="User-Name"] span');
    const text =
      article.querySelector('[data-testid="tweetText"]')?.textContent || "";
    return {
      author: handle,
      name: nameEl?.textContent || "",
      text: text.slice(0, 140),
      url: handle
        ? `https://x.com/${handle}/status/${tweetId}`
        : `https://x.com/i/status/${tweetId}`,
      addedAt: Date.now(),
    };
  }

  // re-render whichever bar variant the current page uses
  function rerenderBar() {
    if (nativeIdFromPath()) renderNativeBar();
    else renderBar();
  }

  // TODO replace the prompt/confirm dialogs with a real injected menu
  function folderMenu(folder) {
    const action = prompt(
      `Folder "${folder.name}" — type "rename" or "delete":`
    );
    if (action === "rename") {
      const name = prompt("New name:", folder.name);
      if (name && name.trim())
        storage.renameFolder(folder.id, name).then(rerenderBar);
    } else if (action === "delete") {
      if (
        confirm(
          `Delete "${folder.name}" and its subfolders? Bookmarks stay on X, they just become unsorted.`
        )
      )
        storage.deleteFolder(folder.id).then(() =>
          // reset a now-dead current folder right away, the stale bar
          // must not act on the deleted id (the storage listener will
          // do this again, harmless)
          validateCurrentFolder().then(rerenderBar)
        );
    }
  }

  // The folder being viewed can be deleted under us (popup, or an
  // ancestor got deleted). Fall back to root instead of filtering the
  // timeline on a dead folder.
  async function validateCurrentFolder() {
    if (!currentFolderId) return;
    // strict read: with plain getAll an unreadable storage looks like
    // "no folders" and we'd kick the user to root for no reason
    const data = await storage.getAllStrict();
    if (!data) return;
    if (data.folders[currentFolderId]) return;
    currentFolderId = null;
    if (/#exf=/.test(location.hash)) {
      history.replaceState(null, "", "/i/bookmarks");
      window.exF.markUrlHandled?.();
    }
  }

  async function enterFolder(folderId) {
    // real history entries so X's back button walks the folder trail
    // instead of leaving the page
    const target = folderId ? `/i/bookmarks#exf=${folderId}` : "/i/bookmarks";
    if (location.pathname + location.hash !== target) {
      history.pushState(null, "", target);
      window.exF.markUrlHandled?.();
    }
    currentFolderId = folderId;
    // no applyFilter here, renderBar toggles the timeline when it
    // commits so the column never goes blank while data loads
    mountXFoldersToggle();
    renderBar();
    // back to the top when switching folders
    document
      .querySelector('[data-testid="primaryColumn"]')
      ?.scrollIntoView({ block: "start" });
  }

  // "Hide X Folders" control below the bookmarks search bar. Block-level
  // sibling insertion, the stable kind (insertions inside virtualized
  // cells are not).
  function mountXFoldersToggle() {
    if (!isBookmarksPage() || nativeIdFromPath() || currentFolderId) {
      document.querySelector(".exf-xfolders-row")?.remove();
      return;
    }
    const input = document.querySelector(
      'input[data-testid="SearchBox_Search_Input"], input[placeholder*="Search" i]'
    );
    const cell = document.querySelector('[data-testid="cellInnerDiv"]');
    const cellContainer = cell?.parentElement;
    if (!input || !cellContainer) return;
    // climb from the input to the block that sits beside the timeline
    let block = input;
    while (
      block.parentElement &&
      !block.parentElement.contains(cellContainer)
    ) {
      block = block.parentElement;
    }
    if (!block.parentElement) return;
    const existing = document.querySelector(".exf-xfolders-row");
    if (existing) {
      if (existing.previousElementSibling === block) return; // placed
      existing.remove();
    }
    // label reads the module cache (warmed at init, kept fresh by
    // onChange) so this stays sync and can't shadow it
    const row = document.createElement("div");
    row.className = "exf-xfolders-row";
    const btn = document.createElement("button");
    btn.className = "exf-crumb exf-xfolders-toggle";
    btn.textContent = hideNativeFolders
      ? "Show X Folders"
      : "Hide X Folders";
    btn.addEventListener("click", async () => {
      hideNativeFolders = !hideNativeFolders;
      applyNativeFolderVisibility(); // paint now, persist after
      await storage.updateSettings({ hideNativeFolders });
      row.remove();
      mountXFoldersToggle();
    });
    row.appendChild(btn);
    block.insertAdjacentElement("afterend", row);
  }

  // Hide X's native folder rows on the main bookmarks page.
  //
  // Do NOT toggle display:none on individual cells or on their
  // containers from JS. X virtualizes the bookmarks list: when the
  // visible mix of folder/tweet cells changes while scrolling, any
  // "hide whole container iff every cell is a folder" heuristic flips
  // on and off, the list remeasures, and scroll jumps to the top.
  //
  // Instead flip one class on <html> and let CSS :has() hide folder
  // rows. That stays stable across recycle/scroll, and never fights
  // applyFilter's exf-hidden on the same nodes.
  function applyNativeFolderVisibility() {
    const on =
      isBookmarksPage() && !nativeIdFromPath() && hideNativeFolders;
    document.documentElement.classList.toggle("exf-hide-xfolders", on);
    // Strip legacy per-node marks from older builds so a recycled
    // cell can't stay blank after becoming a tweet.
    if (document.querySelector(".exf-xhidden")) {
      document
        .querySelectorAll(".exf-xhidden")
        .forEach((el) => el.classList.remove("exf-xhidden"));
    }
  }

  // Inside a folder we hide X's timeline as whole blocks and render our
  // own list (renderBar). Hiding individual cells fights the virtualizer
  // and flickers. The page can have several cell containers (folder rows
  // list, posts timeline), hide every one that hosts cells, plus the
  // search bar. A collapsed bar lifts the filter, otherwise the page
  // would be completely empty.
  function applyFilter() {
    if (!isBookmarksPage()) return;
    const hide =
      currentFolderId !== null && !nativeIdFromPath() && !barCollapsed;

    const containers = new Set(
      [...document.querySelectorAll('[data-testid="cellInnerDiv"]')].map(
        (c) => c.parentElement
      )
    );
    for (const container of containers) {
      container?.classList.toggle("exf-hidden", hide);
    }

    // the search bar searches X bookmarks, noise inside a folder
    const input = document.querySelector(
      'input[data-testid="SearchBox_Search_Input"], input[placeholder*="Search" i]'
    );
    const anyContainer = containers.values().next().value;
    if (input && anyContainer) {
      let block = input;
      while (
        block.parentElement &&
        !block.parentElement.contains(anyContainer)
      ) {
        block = block.parentElement;
      }
      if (block.parentElement) block.classList.toggle("exf-hidden", hide);
    }
  }

  // per-tweet "move to folder" button

  function layoutMoveButton(article, btn) {
    btn.classList.remove("exf-movebtn-low");
    const name = article.querySelector('[data-testid="User-Name"]');
    if (!name) return;
    const br = btn.getBoundingClientRect();
    const nr = name.getBoundingClientRect();
    if (br.width === 0 || nr.width === 0) return;
    const sameRow = nr.bottom > br.top && nr.top < br.bottom;
    const collides = sameRow && nr.right > br.left - 6;
    if (collides) btn.classList.add("exf-movebtn-low");
  }

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
      btn.innerHTML = window.exF.FOLDER_SVG;
      btn.title = "Move to exF folder";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await moveDialog(id, article);
      });
      article.style.position = "relative";
      article.appendChild(btn);
      requestAnimationFrame(() => layoutMoveButton(article, btn));
    }
    document
      .querySelectorAll('article[data-testid="tweet"] .exf-movebtn')
      .forEach((btn) => {
        const article = btn.closest("article");
        if (article) layoutMoveButton(article, btn);
      });
  }

  // On X's native folder pages we show a back-link into our tree
  // instead of the full bar.
  async function renderNativeBar() {
    const bar = document.querySelector(".exf-folderbar");
    if (!bar) return;
    const seq = ++renderSeq;
    const nativeId = nativeIdFromPath();
    const entry = await storage.findNativeFolder(nativeId);
    const path = entry?.parentId
      ? await storage.getFolderPath(entry.parentId)
      : [];
    const children = entry ? await storage.getChildFolders(entry.id) : [];
    if (seq !== renderSeq || !bar.isConnected) return; // superseded
    bar.textContent = "";

    const row = document.createElement("div");
    row.className = "exf-crumbs";
    if (entry) {
      const label = ["exF", ...path.map((f) => f.name)].join(" › ");
      const back = document.createElement("button");
      back.className = "exf-crumb";
      back.textContent = `◂ Back to ${label}`;
      back.addEventListener("click", () => {
        // hash carries the target folder through the page load
        location.href = "/i/bookmarks#exf=" + (entry.parentId || "");
      });
      row.appendChild(back);
    } else {
      const add = document.createElement("button");
      add.className = "exf-crumb";
      add.textContent = "＋ Add this X folder to exF";
      add.addEventListener("click", () => fileNativeDialog(nativeId));
      row.appendChild(add);
    }
    bar.appendChild(row);

    // subfolders filed under this placement. exF children open our
    // folder view, native-linked ones open X's page
    if (entry) {
      const grid = document.createElement("div");
      grid.className = "exf-foldergrid";
      for (const f of children) {
        const tile = document.createElement("button");
        tile.className = "exf-folder";
        tile.innerHTML = `<span class="exf-folder-icon">${window.exF.FOLDER_SVG}</span>`;
        const label = document.createElement("span");
        label.textContent = f.nativeId ? `${f.name} ↗` : f.name;
        tile.appendChild(label);
        tile.addEventListener("click", () => {
          location.href = f.nativeId
            ? `/i/bookmarks/${f.nativeId}`
            : `/i/bookmarks#exf=${f.id}`;
        });
        tile.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          folderMenu(f);
        });
        grid.appendChild(tile);
      }
      const newBtn = document.createElement("button");
      newBtn.className = "exf-folder exf-folder-new";
      newBtn.innerHTML = `<span class="exf-folder-icon exf-folder-plus">＋</span>`;
      const nl = document.createElement("span");
      nl.textContent = "New folder";
      newBtn.appendChild(nl);
      newBtn.addEventListener("click", async () => {
        const name = prompt("Folder name:");
        if (!name || !name.trim()) return;
        await storage.createFolder(name, entry.id);
        renderNativeBar();
      });
      grid.appendChild(newBtn);
      bar.appendChild(grid);
    }
  }

  async function fileNativeDialog(nativeId) {
    const name =
      document
        .querySelector('[data-testid="primaryColumn"] h2')
        ?.textContent?.trim() ||
      prompt("Name for this X folder:") ||
      "X folder";
    const { folders } = await storage.getAll();
    const candidates = Object.values(folders).filter((f) => !f.nativeId);
    const paths = [];
    for (const f of candidates) {
      const path = await storage.getFolderPath(f.id);
      paths.push({ id: f.id, label: path.map((p) => p.name).join(" / ") });
    }
    paths.sort((a, b) => a.label.localeCompare(b.label));
    const menu = paths.map((p, i) => `${i + 1}. ${p.label}`).join("\n");
    const answer = prompt(
      `Put "${name}" inside which exF folder? (0 = top level)\n\n${menu}`
    );
    if (answer === null) return;
    const n = parseInt(answer, 10);
    let parentId = null;
    if (n >= 1 && n <= paths.length) parentId = paths[n - 1].id;
    else if (n !== 0) return;
    await storage.fileNativeFolder(nativeId, name, parentId);
    renderNativeBar();
  }

  // Crude v1 mover, a flat numbered prompt. article (when present)
  // supplies fresh metadata, null keeps whatever is stored.
  async function moveDialog(tweetId, article) {
    const { folders } = await storage.getAll();
    // native placements can't hold bookmarks, skip them
    const all = Object.values(folders).filter((f) => !f.nativeId);
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
      await storage.assignBookmark(
        tweetId,
        paths[n - 1].id,
        article ? extractTweetMeta(article, tweetId) : undefined
      );
    rerenderBar();
  }

  // header button that collapses/expands the folder bar

  async function applyBarCollapsed() {
    const s = await storage.getSettings();
    barCollapsed = !!s.folderBarCollapsed;
    const bar = document.querySelector(".exf-folderbar");
    if (bar) bar.classList.toggle("exf-collapsed", barCollapsed);
    const btn = document.querySelector(".exf-headerbtn");
    if (btn) btn.classList.toggle("exf-on", !barCollapsed);
    applyFilter(); // collapse state decides whether the timeline hides
  }

  function injectHeaderButton() {
    const existing = document.querySelector(".exf-headerbtn");
    if (existing) {
      if (existing.offsetParent) return; // visible, all good
      existing.remove(); // parked in a hidden container, re-anchor
    }
    const column = document.querySelector('[data-testid="primaryColumn"]');
    if (!column) return;
    // preferred anchor: next to X's own "Create a Folder" button
    let anchor = [...column.querySelectorAll("button[aria-label]")].find(
      (b) =>
        !b.classList.contains("exf-headerbtn") &&
        /create a folder/i.test(b.getAttribute("aria-label"))
    );
    // fallback for non-Premium (no native button): last visible header
    // button on the title row
    if (!anchor) {
      const h2 = column.querySelector("h2");
      if (!h2) return;
      const hTop = h2.getBoundingClientRect().top;
      const rowButtons = [
        ...column.querySelectorAll("button[aria-label]"),
      ].filter(
        (b) =>
          !b.classList.contains("exf-headerbtn") &&
          b.offsetParent !== null &&
          Math.abs(b.getBoundingClientRect().top - hTop) < 24
      );
      anchor = rowButtons[rowButtons.length - 1];
    }
    if (!anchor) return;
    const cluster = anchor.parentElement;

    const btn = document.createElement("button");
    btn.className = "exf-headerbtn";
    btn.dataset.exfTip = "Create an exFolder";
    btn.setAttribute("aria-label", "Create an exFolder");
    btn.innerHTML = window.exF.FOLDER_SVG;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const s = await storage.getSettings();
      await storage.updateSettings({
        folderBarCollapsed: !s.folderBarCollapsed,
      });
      applyBarCollapsed();
    });
    cluster.appendChild(btn);
    applyBarCollapsed();
  }

  // mount / unmount

  // Apply a folder id coming from the #exf= hash. Deleted folders fall
  // back to root with the hash cleaned.
  async function applyHashFolder(id) {
    currentFolderId = id || null;
    await validateCurrentFolder();
    renderBar(); // applies the timeline filter when it commits
    mountXFoldersToggle();
  }

  function mount() {
    if (!isBookmarksPage()) return;
    // The hash is the source of truth for the current folder. Sync it
    // before the filter/toggle calls so a folder restored from the URL
    // (refresh, back/forward) paints filtered on the first pass instead
    // of flashing the timeline.
    const prevFolderId = currentFolderId;
    if (!nativeIdFromPath()) {
      currentFolderId =
        /#exf=([a-z0-9]+)/i.exec(location.hash)?.[1] || null;
    }
    injectTweetButtons();
    injectHeaderButton();
    applyNativeFolderVisibility();

    const column = document.querySelector('[data-testid="primaryColumn"]');
    if (!column) return;
    // The page header is the h2's top-level block inside the focusable
    // timeline region. The bar goes right after it, between header and
    // timeline. (Not after the whole timeline wrapper, that put it
    // invisibly at the page bottom.)
    const h2 = column.querySelector("h2");
    if (!h2) return;
    // Only filter once the anchors exist. Hiding the timeline on a pass
    // that bails before creating the bar would leave a blank page.
    applyFilter();
    mountXFoldersToggle();
    const region = h2.closest('div[tabindex="0"]') || column;
    let headerBlock = h2;
    while (
      headerBlock.parentElement &&
      headerBlock.parentElement !== region
    ) {
      headerBlock = headerBlock.parentElement;
    }

    let bar = document.querySelector(".exf-folderbar");
    if (bar && bar.previousElementSibling === headerBlock) {
      mounted = true;
      // already mounted, but the hash sync above may have picked up a
      // different folder which still needs validation + a re-render
      if (!nativeIdFromPath() && currentFolderId !== prevFolderId) {
        applyHashFolder(currentFolderId);
      }
      return;
    }
    bar?.remove(); // stale or badly-anchored bar from an earlier pass

    bar = document.createElement("div");
    bar.className = "exf-folderbar";
    headerBlock.insertAdjacentElement("afterend", bar);
    // A position:fixed header takes no flow space so the bar needs a
    // top margin equal to the header HEIGHT. Don't compute this from
    // viewport offsets, they depend on scroll position and produced
    // huge bogus margins when remounting mid-scroll.
    requestAnimationFrame(() => {
      if (!bar.isConnected) return;
      if (getComputedStyle(headerBlock).position === "fixed") {
        const h = headerBlock.getBoundingClientRect().height;
        if (h > 0 && h < 200) bar.style.marginTop = `${h}px`;
      }
    });
    mounted = true;

    applyBarCollapsed();
    if (nativeIdFromPath()) {
      renderNativeBar();
      return;
    }
    // currentFolderId came from the hash above, it stays in the URL so
    // back/forward can restore it. Ids still need async validation.
    if (currentFolderId) {
      applyHashFolder(currentFolderId);
    } else {
      renderBar();
    }
  }

  function unmount() {
    document.querySelector(".exf-folderbar")?.remove();
    document.querySelector(".exf-headerbtn")?.remove();
    document.querySelector(".exf-xfolders-row")?.remove();
    document.documentElement.classList.remove("exf-hide-xfolders");
    document
      .querySelectorAll(".exf-hidden")
      .forEach((el) => el.classList.remove("exf-hidden"));
    document
      .querySelectorAll(".exf-xhidden")
      .forEach((el) => el.classList.remove("exf-xhidden"));
    mounted = false;
    currentFolderId = null;
  }

  function onNavigate() {
    // always rebuild, the bar's mode differs between /i/bookmarks and
    // X's native folder pages
    unmount();
    if (isBookmarksPage()) mount();
  }

  // warm the setting caches before the first mount pass
  storage.getSettings().then((s) => {
    barCollapsed = !!s.folderBarCollapsed;
    hideNativeFolders = !!s.hideNativeFolders;
  });

  storage.onChange((changes) => {
    if (changes.settings) {
      hideNativeFolders = !!changes.settings.newValue?.hideNativeFolders;
    }
    if (!mounted) return;
    if (changes.settings) {
      applyBarCollapsed();
      applyNativeFolderVisibility();
    }
    if (changes.folders || changes.bookmarkFolders) {
      if (nativeIdFromPath()) {
        renderNativeBar();
      } else {
        validateCurrentFolder().then(() => {
          renderBar();
          mountXFoldersToggle();
        });
      }
    }
  });

  window.exF.bookmarks = { mount, unmount, onNavigate };
})();
