// Dev reloader, no dependencies. Run: node tools/dev-server.js
//
// Watches the source and answers long-polls from the service worker
// (dev block in src/background/service-worker.js). On change the
// extension reloads itself and refreshes open X tabs.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 8890;
const WATCH = ["src", "icons", "manifest.json"];

let version = Date.now();
let waiters = [];

function respond(res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ version }));
}

let debounce;
function onChange(_event, file) {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    version = Date.now();
    console.log(`[exF] change detected (${file || "?"}), reloading`);
    waiters.forEach(respond);
    waiters = [];
  }, 200);
}

for (const target of WATCH) {
  const p = path.join(ROOT, target);
  if (!fs.existsSync(p)) continue;
  fs.watch(p, { recursive: fs.statSync(p).isDirectory() }, onChange);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname !== "/poll") {
      res.writeHead(404);
      res.end();
      return;
    }
    const since = Number(url.searchParams.get("since") || 0);
    if (version > since) return respond(res);
    // hold the request until a change or 25s, whichever comes first
    waiters.push(res);
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== res);
      respond(res);
    }, 25000);
    res.on("close", () => {
      clearTimeout(timer);
      waiters = waiters.filter((w) => w !== res);
    });
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`[exF] dev reloader watching on http://127.0.0.1:${PORT}`)
  );
