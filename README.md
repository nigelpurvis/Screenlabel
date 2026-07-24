# Screenlabel

Search your screenshots by what's actually *in* them.

I made a pattern recognizing algorithm that ingests your screenshots on your laptop, and allows you to organize and search through them. Screenshots no longer have to be weightless clutter on your screen, but used as notes. You won't see 'Screenshot 2026-06-12 at 4.47.13 PM.png' anymore and rather be able to search for a screenshot with 'that missing API key error' or 'the reciept from the hardware store'.

Built with Tauri (so it's a real desktop app) and React. 100% native, so your data is safe.



https://github.com/user-attachments/assets/c662c0cb-6cd9-4b4c-9465-035517bd43de


## How it works

You can't search pixels, so it turns each image into words first:

1. Send the screenshot to GPT-4o, which describes it and reads any text in it.
2. Embed that text with `text-embedding-3-small`.
3. Save a `receipt.png.md` file next to `receipt.png` with the description, text, tags, and a spot for your notes.
4. Add the embedding to a local index so search is fast.

Search embeds your query and ranks everything by cosine similarity. It's just a loop over the index, no vector database, and it's still under a millisecond for a few thousand screenshots.

## Your files stay yours

The `.md` files are the source of truth. They're plain Markdown sitting next to your images, so you can open them in any editor (or Obsidian) and nothing's locked in a database. The `index.json` is just a cache you can delete and rebuild.

It started on Supabase, but I realized I was building the exact thing I was trying to get away from, so I pulled the cloud out and made the local files the truth.

## Bring your own key

No backend, no account. You paste your own OpenAI key in Settings, it's stored locally, and it only talks to OpenAI directly. All the model calls go through one `AIProvider` interface in `ai.ts`, so adding other providers later is easy.

## Running it

Needs Node and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Rust + webview deps).

```bash
npm install
npm run tauri dev      # the desktop app
npm run tauri build    # packaged build
```

First launch asks for your API key. Then hit **+ Ingest** to process a folder, or **Set up inbox** to watch one (new screenshots dropped in get ingested automatically).

## Stack

Tauri 2, React 19 + TypeScript + Vite, OpenAI (GPT-4o + `text-embedding-3-small`), js-yaml.

## Todo

- Encrypted vault for sensitive screenshots (IDs, cards) that never hit the cloud
- Tag filtering
- A "rebuild index" button
