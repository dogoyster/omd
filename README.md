# omd · open markdown

Local-first markdown vault — a **native macOS app** (built with [Tauri](https://tauri.app)) that turns a folder of `.md` files into a **kanban board + editor**. omd reads and writes your files directly on disk; put the folder inside a Google Drive / iCloud synced directory and you get sync for free. No database, no server, no lock-in — just markdown files in folders.

> The core idea: **folder structure _is_ the state.** A card's column is just the folder it lives in.

## Features

- 📋 **Folder = kanban** — `Projects/{1-Todo, 2-In Progress, …}` render as columns; dragging a card moves the file between folders
- ✍️ **WYSIWYG + source toggle** — [Milkdown](https://milkdown.dev) editor with a raw-markdown view; YAML frontmatter is preserved
- 🗂️ **File tree** with a right-click menu — new file/folder, rename, delete (core folders are protected)
- 🆕 **New Note** button — quick-create a note in the current area's `Inbox`
- 📂 **Folder view** — click a directory to list its contents with modified / created dates
- ↩️ **Back navigation** — jump back to the previous note or folder
- 🔍 **Full-text search** over titles and content (`⌘K`)
- 💾 **Auto-save on switch** — no lost edits
- 🌗 Automatic dark mode, remembers your last area/view

## Prerequisites

| Tool | Why | Install |
| --- | --- | --- |
| **macOS** (Apple Silicon / Intel) | target platform | — |
| **Node 18+** | frontend (Vite) | [nodejs.org](https://nodejs.org) |
| **Rust toolchain** | Tauri backend | [rustup.rs](https://rustup.rs) |
| **Xcode Command Line Tools** | native build | `xcode-select --install` |

## Setup

```bash
git clone https://github.com/dogoyster/omd.git
cd omd
npm install
```

## Run (development)

```bash
npm run tauri dev
```

Launches the native app window with hot-reload — edit the React/TypeScript source and the UI updates instantly. (The first run compiles Rust dependencies and takes a few minutes; later runs are seconds.)

> `npm run dev` alone starts only the Vite frontend in a browser, where the Tauri filesystem APIs are unavailable — always use `npm run tauri dev` for the full app.

## Build (.app / .dmg)

```bash
npm run tauri build
```

Outputs:

- App bundle → `src-tauri/target/release/bundle/macos/omd.app`
- Disk image → `src-tauri/target/release/bundle/dmg/omd_<version>_aarch64.dmg`

**Install:** drag `omd.app` into `/Applications`. The app is unsigned, so on **first launch** use **right-click → Open → Open** (only needed once).

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
