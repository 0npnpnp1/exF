// Shared constants. Content scripts can't use ES modules, so everything
// hangs off a single window.exF namespace.
window.exF = window.exF || {};

// The 9 native tag colors — matched to X's own accent palette so chips
// feel at home in both light and dark themes.
window.exF.COLORS = {
  blue:   "#1D9BF0",
  green:  "#00BA7C",
  rose:   "#F91880",
  purple: "#7856FF",
  orange: "#FF7A00",
  yellow: "#FFD400",
  red:    "#E7191F",
  cyan:   "#00B8D9",
  gray:   "#8B98A5",
};

window.exF.SCHEMA_VERSION = 1;
