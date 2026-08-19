# Screenlabel landing page

Two static files, no build step, no dependencies. Open `index.html` directly or
serve the folder:

```bash
python3 -m http.server 4180 --directory site
```

## Before launching

1. **Record `site/demo.gif`.** A 10–20 second screen capture of typing a search
   and results ranking in. This is the single most persuasive thing on the page —
   people decide in about three seconds of scrolling. Until the file exists a
   placeholder stands in, so a missing recording never shows a broken image.
2. **Check the download link works.** The button points at
   `github.com/nigelpurvis/Screenlabel/releases/latest`, which 404s until you
   publish a release. A dead download button is worse than no landing page, so
   ship the signed build first — see [RELEASING.md](../RELEASING.md).

## Deploying

**Vercel** — point a project at this repo, set the root directory to `site`, no
build command. Free, and gives you a custom domain.

**GitHub Pages** — Settings → Pages → deploy from `main`. Pages serves from the
repo root or `/docs`, so either rename `site/` to `docs/` or add a workflow that
publishes the folder.

Either way, buy the domain before launch day. Names go fast and there's no
recovering one someone else took.

## Notes on the copy

The page deliberately leads with the problem (a folder full of
`Screenshot 2026-06-12 at 4.47.13 PM.png`) rather than the technology. Nobody
wants embeddings; they want to find the receipt.

The privacy section states plainly what leaves the machine, because for this
audience that's the reason to trust it — and because it's true and specific,
which reads very differently from "we take your privacy seriously."
