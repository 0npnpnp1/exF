// Builds the Chrome Web Store upload. Run: node tools/build-store.js
//
// Stages only what the extension needs into build/, dropping the
// localhost host permission used by the dev reloader (reviewers
// question localhost access, and the dev block is inert in store
// builds anyway — it checks for update_url). Zips the staged folder.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BUILD = path.join(ROOT, "build");

// Everything the extension loads at runtime, plus the license (AGPL
// requires the license to travel with the distributed work).
const INCLUDE = ["icons", "src", "LICENSE"];
const DEV_HOST = "http://127.0.0.1/*";

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copy(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });

for (const entry of INCLUDE) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.warn(`[exF] skipping missing ${entry}`);
    continue;
  }
  copy(src, path.join(BUILD, entry));
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);
const before = manifest.host_permissions.length;
manifest.host_permissions = manifest.host_permissions.filter(
  (h) => h !== DEV_HOST
);
if (manifest.host_permissions.length !== before) {
  console.log(`[exF] removed dev host permission ${DEV_HOST}`);
}
fs.writeFileSync(
  path.join(BUILD, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);

const zipName = `exF-${manifest.version}-store.zip`;
const zip = path.join(ROOT, zipName);
fs.rmSync(zip, { force: true });
// bsdtar (Windows 10+ System32, and the default tar on macOS) writes
// spec-correct forward-slash paths. PowerShell 5.1's Compress-Archive
// writes backslash entries, which Chrome can fail to resolve inside the
// package. Address System32 directly: on Windows a PATH lookup can hit
// Git's GNU tar, which has no zip support and reads "C:" as a remote host.
const tar =
  process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
// cwd + relative paths keep drive-letter colons out of the arguments.
// Name the entries explicitly rather than ".", which would prefix every
// path with "./" and bury manifest.json below the package root.
const staged = fs.readdirSync(BUILD);
execFileSync(tar, ["-a", "-c", "-f", path.join("..", zipName), ...staged], {
  cwd: BUILD,
  stdio: "inherit",
});

const kb = (fs.statSync(zip).size / 1024).toFixed(1);
console.log(`[exF] ${path.basename(zip)} (${kb} KB)`);
console.log(`[exF] staged in build/ — load unpacked from there to verify`);
