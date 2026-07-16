// User tagging: injects color tag chips into user cells (Following /
// Followers / search lists) and profile headers.
//
// X's DOM is an obfuscated React app, but data-testid attributes are far
// more stable than class names — everything here anchors on those.
window.exF = window.exF || {};

(() => {
  const { storage, COLORS } = window.exF;

  const HANDLE_RE = /^\/([A-Za-z0-9_]{1,15})$/;
  // Reserved top-level paths that look like handles but aren't.
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

  // ---- chip rendering ----

  async function renderChips(container, handle) {
    const tags = await storage.getTagsForUser(handle);
    container.textContent = "";
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "exf-chip";
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

  // ---- tag picker popover ----

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
      await storage.toggleUserTag(handle, tag.id);
      onDone();
      openPicker(anchor, handle, onDone); // re-render picker with new tag
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

  // ---- injection points ----

  function injectIntoUserCell(cell) {
    if (cell.dataset.exfDone) return;
    const link = [...cell.querySelectorAll('a[href^="/"]')].find((a) =>
      handleFromHref(a.getAttribute("href"))
    );
    if (!link) return;
    const handle = handleFromHref(link.getAttribute("href"));
    cell.dataset.exfDone = "1";

    const holder = document.createElement("div");
    holder.className = "exf-chips";
    // Place under the name/handle block: the cell's second column.
    const nameBlock = link.closest('div[dir="ltr"]')?.parentElement || cell;
    nameBlock.appendChild(holder);
    renderChips(holder, handle);
  }

  function injectIntoProfile() {
    const header = document.querySelector('[data-testid="UserName"]');
    if (!header || header.dataset.exfDone) return;
    const handle = handleFromHref(location.pathname);
    if (!handle) return;
    header.dataset.exfDone = "1";

    const holder = document.createElement("div");
    holder.className = "exf-chips exf-chips-profile";
    header.appendChild(holder);
    renderChips(holder, handle);
  }

  function scan() {
    document
      .querySelectorAll('[data-testid="UserCell"]:not([data-exf-done])')
      .forEach(injectIntoUserCell);
    injectIntoProfile();
  }

  // Re-render everything when data changes elsewhere (e.g. popup).
  storage.onChange((changes) => {
    if (changes.tags || changes.userTags) {
      document.querySelectorAll("[data-exf-done]").forEach((el) => {
        delete el.dataset.exfDone;
      });
      document.querySelectorAll(".exf-chips").forEach((el) => el.remove());
      scan();
    }
  });

  window.exF.tagger = { scan };
})();
