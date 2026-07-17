// Tag chips on user cells (following/followers/search lists), profile
// headers and hover cards.
//
// X's DOM is an obfuscated react app but data-testid attributes are
// way more stable than class names, so everything anchors on those.
window.exF = window.exF || {};

(() => {
  const { storage, COLORS } = window.exF;

  const HANDLE_RE = /^\/([A-Za-z0-9_]{1,15})$/;
  // top-level paths that look like handles but aren't
  const NOT_HANDLES = new Set([
    "home", "explore", "notifications", "messages", "search", "settings",
    "compose", "i", "login", "logout", "signup", "about", "tos", "privacy",
    "jobs", "verified", "premium",
  ]);

  function handleFromHref(href) {
    const m = HANDLE_RE.exec(href);
    if (!m) return null;
    const h = m[1];
    return NOT_HANDLES.has(h.toLowerCase()) ? null : h;
  }

  async function renderChips(container, handle) {
    const tags = await storage.getTagsForUser(handle);
    container.textContent = "";
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "exf-chip";
      chip.dataset.color = tag.color;
      chip.style.setProperty("--exf-c", COLORS[tag.color] || COLORS.gray);
      chip.textContent = tag.name;
      container.appendChild(chip);
    }
    const add = document.createElement("button");
    add.className = "exf-chip exf-chip-add";
    add.textContent = tags.length ? "+" : "+ tag";
    add.title = `Tag @${handle}`;
    add.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPicker(add, handle, () => renderChips(container, handle));
    });
    container.appendChild(add);
  }

  // tag picker popover

  let openPickerEl = null;

  function closePicker() {
    if (openPickerEl) {
      openPickerEl.remove();
      openPickerEl = null;
    }
  }

  document.addEventListener("click", (e) => {
    if (openPickerEl && !openPickerEl.contains(e.target)) closePicker();
  });

  async function openPicker(anchor, handle, onDone) {
    closePicker();
    const { tags } = await storage.getAll();
    const assigned = new Set(
      (await storage.getTagsForUser(handle)).map((t) => t.id)
    );

    const pop = document.createElement("div");
    pop.className = "exf-popover";
    openPickerEl = pop;

    const title = document.createElement("div");
    title.className = "exf-popover-title";
    title.textContent = `Tags for @${handle}`;
    pop.appendChild(title);

    const list = document.createElement("div");
    list.className = "exf-popover-list";
    const allTags = Object.values(tags).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const tag of allTags) {
      const row = document.createElement("button");
      row.className = "exf-popover-row";
      if (assigned.has(tag.id)) row.classList.add("exf-on");
      const dot = document.createElement("span");
      dot.className = "exf-dot";
      dot.style.background = COLORS[tag.color] || COLORS.gray;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(tag.name));
      const check = document.createElement("span");
      check.className = "exf-check";
      check.textContent = "✓";
      row.appendChild(check);
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        await storage.toggleUserTag(handle, tag.id);
        row.classList.toggle("exf-on");
        onDone();
      });
      list.appendChild(row);
    }
    pop.appendChild(list);

    // inline "new tag" form
    const form = document.createElement("div");
    form.className = "exf-newtag";
    const input = document.createElement("input");
    input.className = "exf-input";
    input.placeholder = "New tag name…";
    input.maxLength = 24;
    form.appendChild(input);
    const swatches = document.createElement("div");
    swatches.className = "exf-swatches";
    let picked = "blue";
    for (const [key, hex] of Object.entries(COLORS)) {
      const sw = document.createElement("button");
      sw.className = "exf-swatch";
      sw.style.background = hex;
      sw.title = key;
      if (key === picked) sw.classList.add("exf-on");
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        picked = key;
        swatches
          .querySelectorAll(".exf-swatch")
          .forEach((s) => s.classList.remove("exf-on"));
        sw.classList.add("exf-on");
      });
      swatches.appendChild(sw);
    }
    form.appendChild(swatches);
    const create = document.createElement("button");
    create.className = "exf-btn";
    create.textContent = "Create & apply";
    create.addEventListener("click", async (e) => {
      e.stopPropagation();
      const name = input.value.trim();
      if (!name) return;
      const tag = await storage.createTag(name, picked);
      if (!tag) return; // storage unreadable, nothing created
      await storage.toggleUserTag(handle, tag.id);
      onDone();
      openPicker(anchor, handle, onDone); // reopen with the new tag in it
    });
    form.appendChild(create);
    pop.appendChild(form);

    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const popW = 260;
    pop.style.left =
      Math.min(r.left, window.innerWidth - popW - 12) + "px";
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 320) + "px";
    input.focus();
  }

  // injection

  function injectIntoUserCell(cell) {
    if (cell.dataset.exfDone || cell.querySelector(".exf-chips")) return;
    // first @xxx span in document order is the header handle, not a
    // bio mention
    const atSpan = [...cell.querySelectorAll("span")].find((s) =>
      /^@[A-Za-z0-9_]{1,15}$/.test(s.textContent)
    );
    if (!atSpan) return;
    const handle = atSpan.textContent.slice(1);
    cell.dataset.exfDone = "1";
    cell.dataset.exfHandle = handle;

    // Append at the end of the handle's own line. Inserting between
    // react-managed siblings breaks eventually, trailing append is the
    // only pattern that survived.
    const holder = document.createElement("span");
    holder.className = "exf-chips exf-chips-inline";
    const lineEl = atSpan.closest("div") || atSpan.parentElement;
    lineEl.appendChild(holder);
    renderChips(holder, handle);
  }

  // X recycles DOM nodes across navigations: a cell injected for one
  // user can get re-rendered showing another (handle mismatch), or a
  // re-render drops our chips but keeps the cell and its data-exf-done
  // marker. Both need repair or scan() skips the cell forever.
  function reconcileRecycledCells() {
    document
      .querySelectorAll('[data-testid="UserCell"][data-exf-done]')
      .forEach((cell) => {
        const atSpan = [...cell.querySelectorAll("span")].find((s) =>
          /^@[A-Za-z0-9_]{1,15}$/.test(s.textContent)
        );
        const current = atSpan?.textContent.slice(1).toLowerCase();
        const injected = (cell.dataset.exfHandle || "").toLowerCase();
        const recycled = current && injected && current !== injected;
        const chipsLost = !cell.querySelector(".exf-chips");
        if (recycled || chipsLost) {
          cell.querySelector(".exf-chips")?.remove();
          delete cell.dataset.exfDone;
          delete cell.dataset.exfHandle;
          injectIntoUserCell(cell);
        }
      });
  }

  function injectIntoProfile() {
    const header = document.querySelector('[data-testid="UserName"]');
    if (!header) return;
    const handle = handleFromHref(location.pathname);
    if (!handle) return;
    // same header element gets reused across profile navigations, only
    // skip when it still shows the same handle
    if (
      header.dataset.exfHandle === handle &&
      document.querySelector(".exf-chips-profile")
    )
      return;
    document.querySelectorAll(".exf-chips-profile").forEach((el) => el.remove());
    header.dataset.exfHandle = handle;

    const holder = document.createElement("div");
    holder.className = "exf-chips exf-chips-profile";
    // own line between the handle and the bio
    header.insertAdjacentElement("afterend", holder);
    renderChips(holder, handle);
  }

  // master switch, wired to the popup's "Show tags on X" toggle
  let taggingEnabled = true;

  function removeAllChips() {
    closePicker();
    document.querySelectorAll("[data-exf-done]").forEach((el) => {
      delete el.dataset.exfDone;
    });
    document.querySelectorAll("[data-exf-handle]").forEach((el) => {
      delete el.dataset.exfHandle;
    });
    document.querySelectorAll(".exf-chips").forEach((el) => el.remove());
  }

  // Profile hover cards (hovering a reply author etc). Recreated and
  // recycled per hover, so track which handle we rendered for.
  function injectIntoHoverCard() {
    const card = document.querySelector('[data-testid="HoverCard"]');
    if (!card) return;
    // if the card embeds a UserCell the cell injector already covers it
    if (card.querySelector('[data-testid="UserCell"]')) return;
    const atSpan = [...card.querySelectorAll("span")].find((s) =>
      /^@[A-Za-z0-9_]{1,15}$/.test(s.textContent)
    );
    if (!atSpan) return;
    const handle = atSpan.textContent.slice(1);
    if (
      card.dataset.exfHandle === handle &&
      card.querySelector(".exf-chips")
    )
      return;
    card.querySelectorAll(".exf-chips").forEach((el) => el.remove());
    card.dataset.exfHandle = handle;
    const holder = document.createElement("span");
    holder.className = "exf-chips exf-chips-inline";
    const lineEl = atSpan.closest("div") || atSpan.parentElement;
    lineEl.appendChild(holder);
    renderChips(holder, handle);
  }

  function scan() {
    if (!taggingEnabled) return;
    document
      .querySelectorAll('[data-testid="UserCell"]:not([data-exf-done])')
      .forEach((cell) => {
        try {
          injectIntoUserCell(cell);
        } catch {
          // never let one bad cell break the page
        }
      });
    try {
      reconcileRecycledCells();
    } catch {
      // ignore
    }
    try {
      injectIntoHoverCard();
    } catch {
      // ignore
    }
    try {
      injectIntoProfile();
    } catch {
      // ignore
    }
  }

  storage.getSettings().then((s) => {
    taggingEnabled = s.taggingEnabled !== false;
    // the initial route() may have injected before this resolved
    if (!taggingEnabled) removeAllChips();
  });

  // re-render when data changes elsewhere (popup etc)
  storage.onChange((changes) => {
    let rebuild = !!(changes.tags || changes.userTags);
    if (changes.settings) {
      const wasEnabled = taggingEnabled;
      taggingEnabled =
        changes.settings.newValue?.taggingEnabled !== false;
      if (!taggingEnabled) {
        removeAllChips();
        return;
      }
      // settings is shared with the bookmarks feature. Only a
      // taggingEnabled flip should tear chips down, folder bar toggles
      // must not flicker every chip on the page.
      if (!wasEnabled) rebuild = true;
    }
    if (rebuild) {
      removeAllChips();
      scan();
    }
  });

  window.exF.tagger = { scan };
})();
