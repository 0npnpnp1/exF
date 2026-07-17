// Entry point. X is a SPA and never does full page loads, so a
// MutationObserver plus a URL check is our routing layer.
window.exF = window.exF || {};

(() => {
  const { tagger, bookmarks } = window.exF;

  let lastUrl = location.href;
  let scheduled = false;

  // Mirror X's theme onto <html> so the css can adjust chip colors on
  // light backgrounds. Checked on every route pass, live theme
  // switches get picked up too.
  function updateTheme() {
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
      if (!m) return;
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      document.documentElement.classList.toggle("exf-light", lum > 0.5);
    } catch {
      // ignore
    }
  }

  function route() {
    updateTheme();
    tagger.scan();
    bookmarks.mount();
  }

  const observer = new MutationObserver(() => {
    // After an extension reload this script is an orphan and every
    // chrome.* call throws. Shut down, the tab refresh brings a fresh
    // copy.
    if (!chrome.runtime?.id) {
      observer.disconnect();
      return;
    }
    if (scheduled) return;
    scheduled = true;
    // debounce bursts of react re-renders into one pass
    setTimeout(() => {
      scheduled = false;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        bookmarks.onNavigate();
      }
      route();
    }, 250);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // exF pushes its own history entries for folder navigation and marks
  // them handled so the observer doesn't tear the page down.
  window.exF.markUrlHandled = () => {
    lastUrl = location.href;
  };

  // back/forward restores the folder from the hash
  window.addEventListener("popstate", () => {
    lastUrl = location.href;
    bookmarks.onNavigate();
    route();
  });

  route();
})();
