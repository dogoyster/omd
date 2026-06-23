# omd · open markdown

Local-first markdown vault that runs in your browser. Point it at a folder of `.md` files and **browse the folder structure as a kanban board**, edit with **WYSIWYG or raw markdown**, and never touch a database or server — omd reads and writes files directly through the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API). Put the folder inside a Google Drive / iCloud synced directory and you get sync for free.

> The core idea: **folder structure _is_ the state.** A card's column is just the folder it lives in.

## Features

- 📋 **Folder = kanban** — `Projects/{1-Todo, 2-In Progress, …}` render as columns; dragging a card moves the file between folders
- ✍️ **WYSIWYG + source toggle** — [Milkdown](https://milkdown.dev) editor with a raw-markdown view; YAML frontmatter is preserved
- 🗂️ **File tree** with a right-click menu — new file/folder, rename, delete (core folders are protected)
- 🔍 **Full-text search** over titles and content (`⌘K`)
- 💾 **Auto-save on switch** — no lost edits
- 🌗 Automatic dark mode, remembers your last area/view

## Requirements

- A **Chromium-based browser** (Chrome or Edge). The File System Access API is required and is **not** available in Safari or Firefox.
- **Node 18+** to run the dev server.

## Getting started

```bash
npm install
npm run dev
```

Open the printed `localhost` URL in Chrome/Edge, click **Connect vault folder**, and choose a markdown folder — ideally one inside your Google Drive / iCloud synced directory so changes sync across devices.

## Suggested vault layout

```
Work/  ·  Personal/                                   # areas
├─ Inbox/                                             # raw capture
├─ Projects/{1-Todo, 2-In Progress, 3-Ready to Review, 4-Done}/   # kanban stages
└─ Archive/
```

Status is expressed purely by **which folder a file sits in** — there's no `status` field in frontmatter to drift out of sync.

## Build

```bash
npm run build     # tsc + vite build → dist/
npm run preview   # serve the production build locally
```

## Tech

React + TypeScript + Vite · Milkdown (Crepe) · CodeMirror 6 · dnd-kit · File System Access API.

## License

[MIT](./LICENSE) © dogoyster
