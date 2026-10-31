# PageForge Studio

A Scribus-inspired desktop publishing app that runs entirely in your browser.
Multi-page canvas, exact physical page sizes, frames, guides, and PDF/PNG/JSON
export — with nothing to install and nothing uploaded: every document and
preset lives in your browser, and anything you want to keep forever can be
downloaded as a file.

**Live demo:** https://mpem1.github.io/canvas-template/ — free GitHub
Pages hosting, updated automatically on every push to `main`.

## Features

- **Pages & sizes** — multi-page documents, presets (Letter, A4, A3, poster,
  business card...) plus custom sizes in inches, mm or px (e.g. 13 x 19 in =
  1248 x 1824 px), margins, bleed lines with snapping, landscape or portrait.
- **Frames** — text frames (font, size, color, stroke, drop shadow with
  adjustable offset, auto-fit / fill-height), image frames (PNG / JPEG / SVG /
  Photoshop PSD import, pan & zoom inside the frame), and shape frames.
- **Layout tools** — alignment & distribution, magnetic snapping, layering,
  undo/redo, keyboard shortcuts.
- **Guidelines** — drag guides out of the rulers, per-page scoping (a guide
  never draws across a neighboring page), any color, recovery for lost
  off-page guides, numeric placement plus column/row presets.
- **Templates** — starter designs (posters, brochures, pamphlets, ads) and
  unlimited user templates in any page size.
- **Portable files** — export the whole document as an editable
  `.pageforge.json` project file; save any template preset as a
  `.pageforge.template.json` file or bundle everything into a dated backup —
  presets survive cleared browser caches and move between computers.
- **Export** — print-ready PDF at exact physical size, page PNGs, project JSON.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

No database, no server-side state, no accounts — `npm run dev` is the whole
stack.

## GitHub Pages

`.github/workflows/deploy-pages.yml` runs on every push to `main`: it builds
the static export (`STATIC_EXPORT=1 npx next build`) and force-publishes
`out/` to the `gh-pages` branch, from which GitHub Pages serves the site —
fully automatic, no manual steps. The export is configured in
`next.config.ts` with `basePath: /canvas-template` — if you rename the
repository, update that one value (and the demo link above).

## Project structure

```
src/app/            single-route Next.js app (client-side)
src/components/     canvas, frames, panels, dialogs
src/lib/editor/     store (Zustand), types, templates, snap, exporters,
                    IndexedDB storage (templates + autosave)
scripts/            Playwright verification suites (one per feature)
```

## Testing

Each feature ships with a Playwright suite, e.g.:

```bash
node scripts/verify_template_files.js   # template export/import round-trip
node scripts/verify_guides.js           # guidelines: drag, snap, color, recovery
```

Run a dev server on port 3000 first. Suites are written to be deterministic
and assert on the store and the rendered DOM.
