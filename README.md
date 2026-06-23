# omd · open markdown

Local-first markdown vault — a **native macOS app** (built with [Tauri](https://tauri.app)) that turns a folder of `.md` files into a **kanban board + editor**. omd reads and writes your files directly on disk; put the folder inside a Google Drive / iCloud synced directory and you get sync for free. No database, no server, no lock-in — just markdown files in folders.

> The core idea: **folder structure _is_ the state.** A card's column is just the folder it lives in.

## Features

- 📋 **Folder = kanban** — `Projects/{1-Todo, 2-In Progress, …}` render as columns; dragging a card moves the file between folders
- ✍️ **WYSIWYG + source toggle** — [Milkdown](https://milkdown.dev) editor with a raw-markdown view; YAML frontmatter is preserved
- 🗂️ **File tree** with a right-click menu — new file/folder, rename, delete (core folders are protected)
- 🔍 **Full-text search** over titles and content (`⌘K`)
- 💾 **Auto-save on switch** — no lost edits
- 🌗 Automatic dark mode, remembers your last area/view

## Requirements

- **macOS** (Apple Silicon or Intel). The packaged app is unsigned, so on first launch use **right-click → Open**.
- For development / building from source: **Node 18+** and the **Rust toolchain** (install via [rustup](https://rustup.rs)).

## Run from source

```bash
npm install
npm run tauri dev       # launches the native app in dev mode (HMR)
```

## Build a .app

```bash
npm run tauri build     # → src-tauri/target/release/bundle/macos/omd.app  (+ .dmg)
```

Drag `omd.app` into `/Applications`. First launch: **right-click → Open** (the app is unsigned).

## Suggested vault layout

```
Work/  ·  Personal/                                   # areas
├─ Inbox/                                             # raw capture
├─ Projects/{1-Todo, 2-In Progress, 3-Ready to Review, 4-Done}/   # kanban stages
└─ Archive/
```

Status is expressed purely by **which folder a file sits in** — there's no `status` field in frontmatter to drift out of sync.

## Tech

Tauri 2 · React + TypeScript + Vite · Milkdown (Crepe) · CodeMirror 6 · dnd-kit.

## License

[MIT](./LICENSE) © dogoyster
