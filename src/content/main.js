// Entry point: watches X's SPA for DOM/URL changes and re-runs the
// injectors. X never does full page loads, so a MutationObserver +
// URL-change check is the routing layer.
window.exF = window.exF || {};

(() => {
  const { tagger, bookmarks } = window.exF;

  let lastUrl = location.href;
  let scheduled = false;

  function route() {
    tagger.scan();
    bookmarks.mount();
  }

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    // Debounce bursts of React re-renders into one pass per frame-ish.
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

  route();
})();
