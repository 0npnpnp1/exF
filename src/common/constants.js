// Content scripts can't use ES modules, so shared stuff hangs off a
// single window.exF namespace.
window.exF = window.exF || {};

// 9 tag colors, roughly matched to X's own accent palette so chips
// don't look out of place in either theme.
window.exF.COLORS = {
  blue:     "#1D9BF0",
  mint:     "#8FEBD4",
  rose:     "#F91880",
  lavender: "#B5BBEF",
  orange:   "#FF7A00",
  yellow:   "#FFD400",
  red:      "#E7191F",
  cyan:     "#00B8D9",
  gray:     "#8B98A5",
};

window.exF.SCHEMA_VERSION = 2;

// v1 had "green" and "purple", renamed in v2. The service worker
// migrates stored tags, popup import handles old backup files.
window.exF.LEGACY_COLORS = { green: "mint", purple: "lavender" };

// folder glyph as inline svg, the emoji looked too iOS
window.exF.FOLDER_SVG =
  '<svg viewBox="0 0 24 24" fill="#8B98A5" aria-hidden="true">' +
  '<path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>' +
  "</svg>";
