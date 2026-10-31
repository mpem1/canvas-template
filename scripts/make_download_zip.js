/* Build a clean, self-contained zip of PageForge Studio for local testing.
 * - Includes only files reachable from src/app entry points (prunes unused
 *   scaffold UI components, api route, prisma db, etc.)
 * - Generates a minimal package.json with exactly the externals the reachable
 *   files import (versions mapped from the scaffold package.json)
 * - Adapts next.config.ts (drop standalone output) and scripts (plain next
 *   build / next start) so it runs anywhere with npm install && npm run dev
 * - Asserts every external import is covered by the generated package.json
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "/home/z/my-project";
const STAGE = path.join(ROOT, "tmp-zip", "pageforge-studio");
const ZIP = path.join(ROOT, "download", "pageforge-studio.zip");

const orig = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

/* ---------- 1. reachable closure from app entry points ---------- */
const roots = ["src/app/layout.tsx", "src/app/page.tsx", "src/app/globals.css"];
const seen = new Set();
const queue = [...roots];
function resolveSpec(spec, fromFile) {
  let base = null;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    base = path.join(path.dirname(fromFile), spec);
  if (!base) return null;
  for (const c of [base, base + ".ts", base + ".tsx", base + ".css", base + ".js", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
while (queue.length) {
  const f = queue.shift();
  if (!f || seen.has(f) || !fs.existsSync(f)) continue;
  seen.add(f);
  if (f.endsWith(".css")) continue;
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of src.matchAll(/\b(?:from|import)(?:\s+|\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const r = resolveSpec(m[1], f);
    if (r) queue.push(r);
  }
}

/* ---------- 2. externals used by reachable files ---------- */
const externals = new Set(["next", "react", "react-dom"]);
for (const f of seen) {
  if (f.endsWith(".css")) continue;
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of src.matchAll(/\b(?:from|import)(?:\s+|\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const s = m[1];
    if (s.startsWith(".") || s.startsWith("@/") || s === "react" || s === "next") continue;
    externals.add(s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);
  }
}

/* ---------- 3. staging ---------- */
fs.rmSync(path.join(ROOT, "tmp-zip"), { recursive: true, force: true });
for (const f of seen) {
  const dest = path.join(STAGE, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), dest);
}
fs.cpSync(path.join(ROOT, "public"), path.join(STAGE, "public"), { recursive: true });
for (const c of ["tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "components.json", "next-env.d.ts", ".gitignore"]) {
  const src = path.join(ROOT, c);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(STAGE, c));
}

/* next.config: plain build (no standalone) so `next start` works anywhere */
fs.writeFileSync(
  path.join(STAGE, "next.config.ts"),
  `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
};

export default nextConfig;
`,
);

/* ---------- 4. minimal package.json ---------- */
const deps = {};
const devDeps = {
  typescript: orig.devDependencies.typescript,
  "@types/react": orig.devDependencies["@types/react"],
  "@types/react-dom": orig.devDependencies["@types/react-dom"],
  "@types/node": "^20",
  tailwindcss: orig.devDependencies.tailwindcss,
  "@tailwindcss/postcss": orig.devDependencies["@tailwindcss/postcss"],
  "tw-animate-css": orig.devDependencies["tw-animate-css"],
};
const runtime = new Set(["next", "react", "react-dom"]);
for (const name of [...externals].sort()) {
  if (runtime.has(name)) continue;
  const v = orig.dependencies[name];
  if (!v) throw new Error(`No version found for external: ${name}`);
  if (devDeps[name] !== undefined) continue;
  deps[name] = v;
}
for (const n of ["next", "react", "react-dom"]) deps[n] = orig.dependencies[n];

const pkg = {
  name: "pageforge-studio",
  version: "1.0.0",
  private: true,
  description: "PageForge Studio — a Scribus-inspired web desktop publishing app",
  scripts: {
    dev: "next dev -p 3000",
    build: "next build",
    start: "next start",
  },
  dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
  devDependencies: devDeps,
};
fs.writeFileSync(path.join(STAGE, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

/* ---------- 5. assert coverage ---------- */
const missing = [...externals].filter((n) => !pkg.dependencies[n] && !pkg.devDependencies[n]);
if (missing.length) throw new Error("Missing deps: " + missing.join(", "));

/* ---------- 6. zip ---------- */
execSync(`cd ${path.join(ROOT, "tmp-zip")} && rm -f ${ZIP} && zip -qr ${ZIP} pageforge-studio`, { stdio: "inherit" });
const kb = (fs.statSync(ZIP).size / 1024).toFixed(0);
console.log(`reachable files: ${seen.size}`);
console.log(`external deps:   ${Object.keys(pkg.dependencies).length} runtime + ${Object.keys(devDeps).length} dev`);
console.log(`ZIP OK: ${ZIP} (${kb} KB)`);
