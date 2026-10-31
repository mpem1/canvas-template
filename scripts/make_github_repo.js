/* Stage a git-ready PageForge Studio tree for the GitHub repo (mpem1/canvas-template).
 * Same reachable-closure logic as make_download_zip.js, plus:
 *   - scripts/ (Playwright suites) and worklog.md for provenance
 *   - README.md / .gitignore / .github/workflows/deploy-pages.yml from gh-assets
 *   - next.config.ts adapted: plain build normally, STATIC_EXPORT=1 -> static
 *     export for GitHub Pages (basePath matches the repo name)
 *   - package.json: minimal, only deps the reachable files actually import
 * Output: /tmp/ghstage (override with GH_STAGE env).
 */
const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project";
const STAGE = process.env.GH_STAGE || "/tmp/ghstage";
const REPO_NAME = "canvas-template";
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
fs.rmSync(STAGE, { recursive: true, force: true });
for (const f of seen) {
  const dest = path.join(STAGE, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), dest);
}
fs.cpSync(path.join(ROOT, "public"), path.join(STAGE, "public"), { recursive: true });
for (const c of ["tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "components.json", "next-env.d.ts"]) {
  const src = path.join(ROOT, c);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(STAGE, c));
}
/* Playwright suites + worklog: the project's verification story */
fs.mkdirSync(path.join(STAGE, "scripts"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "scripts"))) {
  if (/\.(js|json|sh)$/.test(f)) fs.copyFileSync(path.join(ROOT, "scripts", f), path.join(STAGE, "scripts", f));
}
fs.copyFileSync(path.join(ROOT, "worklog.md"), path.join(STAGE, "worklog.md"));
/* repo meta files */
fs.copyFileSync(path.join(ROOT, "scripts", "gh-assets", "README.md"), path.join(STAGE, "README.md"));
fs.copyFileSync(path.join(ROOT, "scripts", "gh-assets", "gitignore"), path.join(STAGE, ".gitignore"));
fs.mkdirSync(path.join(STAGE, ".github", "workflows"), { recursive: true });
fs.copyFileSync(
  path.join(ROOT, "scripts", "gh-assets", "deploy-pages.yml"),
  path.join(STAGE, ".github", "workflows", "deploy-pages.yml"),
);

/* ---------- 4. adaptive next.config.ts ---------- */
fs.writeFileSync(
  path.join(STAGE, "next.config.ts"),
  `import type { NextConfig } from "next";

/* Local/standalone: normal Next server build. CI (GitHub Pages): set
 * STATIC_EXPORT=1 for a static export into out/. basePath must match the
 * repo name for project Pages sites — update it if the repo is renamed. */
const isStatic = !!process.env.STATIC_EXPORT;

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        basePath: "/${REPO_NAME}",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};

export default nextConfig;
`,
);

/* ---------- 5. minimal package.json ---------- */
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
for (const name of [...externals].sort()) {
  const v = orig.dependencies[name];
  if (!v) throw new Error(`No version found for external: ${name}`);
  if (devDeps[name] !== undefined) continue;
  deps[name] = v;
}
for (const n of ["next", "react", "react-dom"]) deps[n] = orig.dependencies[n];

const pkg = {
  name: REPO_NAME,
  version: "1.0.0",
  private: true,
  description: "PageForge Studio — a Scribus-inspired web desktop publishing app (static-export ready)",
  scripts: {
    dev: "next dev -p 3000",
    build: "next build",
    start: "next start",
  },
  dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
  devDependencies: devDeps,
};
fs.writeFileSync(path.join(STAGE, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

/* ---------- 6. coverage assert + summary ---------- */
const missing = [...externals].filter((n) => !pkg.dependencies[n] && !pkg.devDependencies[n]);
if (missing.length) throw new Error("Missing deps: " + missing.join(", "));
console.log(`staged: ${seen.size} reachable files + scripts + meta -> ${STAGE}`);
console.log(`deps:   ${Object.keys(pkg.dependencies).length} runtime + ${Object.keys(devDeps).length} dev`);
