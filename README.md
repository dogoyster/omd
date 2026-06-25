# omd · open markdown

A **local-first markdown vault** for macOS — a native app (built with [Tauri](https://tauri.app)) that turns a folder of `.md` files into a **kanban board + WYSIWYG editor**. omd reads and writes your files directly on disk: no database, no server, no lock-in — just markdown in folders. Put the vault inside a Google Drive / iCloud folder and you get sync for free.

> **Core idea: the folder structure _is_ the state.** A card's column is simply the folder it lives in — there's no hidden `status` field to drift out of sync.

---

## Features

**Organize**
- **Any folder as a board or a list** — open a folder and switch between **kanban** (its subfolders become columns, the `.md` files inside become cards) and **list** view. The choice is remembered per folder.
- **Free structure** — `Work` / `Personal` are the two top-level areas; under them you create, rename, and delete folders however you like. Drag a card or a file to move it between folders.
- **Drag-to-move** in both the kanban board and the list (grab the row handle), or anywhere in the sidebar tree.

**Write**
- **WYSIWYG editor** ([Milkdown](https://milkdown.dev)) with a **raw-markdown source** toggle ([CodeMirror](https://codemirror.net)). YAML frontmatter is preserved.
- **`[[wikilinks]]`** — type `[[` for note autocomplete; click a link to jump to that note.
- **Title ⇄ filename sync** — the first `# H1` and the filename stay in step automatically (edit either, the other follows).
- **Properties panel** — set `priority` / `due` / `tags` / `project` without touching the raw frontmatter.
- **Autosave** (debounced + on focus loss) and explicit `⌘S`.

**Navigate**
- **Tabs** with independent back/forward history. **`⌘`-click** (or right-click) opens a note/folder in a new tab; right-click also opens it in a **new window**.
- **Full-text search** over titles and content (`⌘K`).
- Collapsible sidebar; the tree remembers which folders you expanded.

**Safe with cloud sync**
- **Delete → macOS Trash** (recoverable in Finder — also avoids a Google Drive delete-failure issue).
- **External-change aware** — if a note changes on disk (e.g. a sync pulls an update) you get a banner to load it instead of a surprise overwrite.
- **Conflict-copy detection** — flags Google-Drive-style `name (1).md` duplicates.

**Polish**
- Theme: system / light / dark. Window size & position are remembered. Modern, minimal UI.

---

## Install (download)

> Pre-built releases are not published yet — [build from source](#build-from-source) below. (The app is currently **macOS-only**.)

Once you have `omd.app`, drag it into `/Applications`. Because the app is **unsigned**, the first launch needs **right-click → Open → Open** (only once); afterwards it opens normally.

---

## Concepts

- **Vault** — any folder of markdown files you point omd at (via *Connect vault folder*). The path is remembered between launches.
- **Areas** — `Work` and `Personal`, the two fixed top-level buckets. Switch with the segmented control (it doubles as "go to area root").
- **Sync** — omd has *no* sync code; it just edits files. Keep your vault inside an OS-synced folder (Google Drive, iCloud Drive, Dropbox…) and the OS handles syncing.

A handy starting layout (omd can scaffold this for you on first run, but nothing is enforced):

```
Work/   ·   Personal/                                            # areas
├─ Inbox/                                                        # quick capture
├─ Projects/{1-Todo, 2-In Progress, 3-Ready to Review, 4-Done}/  # a kanban board
└─ Archive/
```

Open `Projects` and switch to **kanban** → each subfolder is a column. Drag a card from `1-Todo` to `4-Done` and the file physically moves folders.

### Frontmatter

omd uses a light YAML frontmatter convention; kanban cards read it for sorting and chips:

```markdown
---
project:
priority: mid        # high | mid | low
created: 2026-06-25
due:
tags: []
source:
---

# Note title
```

---

## Keyboard shortcuts

| Shortcut        | Action                          |
| --------------- | ------------------------------- |
| `⌘N`            | New note (in the default folder)|
| `⌘K`            | Search                          |
| `⌘S`            | Save                            |
| `⌘B`            | Toggle sidebar                  |
| `⌘[` / `⌘]`     | Back / forward                  |
| `⌘`-click       | Open note/folder in a new tab   |

Right-click a file or folder for: open / open in new tab / open in new window / list or kanban view / new file / new folder / rename / delete.

---

## Build from source

### Prerequisites

| Tool | Why | Install |
| --- | --- | --- |
| **macOS** (Apple Silicon / Intel) | target platform | — |
| **Node 18+** | frontend (Vite) | [nodejs.org](https://nodejs.org) |
| **Rust toolchain** | Tauri backend | [rustup.rs](https://rustup.rs) |
| **Xcode Command Line Tools** | native build | `xcode-select --install` |

### Setup

```bash
git clone https://github.com/dogoyster/omd.git
cd omd
npm install
```

### Run (development)

```bash
npm run tauri dev
```

Launches the native window with hot-reload — edit the React/TypeScript source and the UI updates instantly. (The first run compiles Rust dependencies and takes a few minutes; later runs are seconds.)

> ⚠️ `npm run dev` alone starts **only** the Vite frontend in a browser, where Tauri's filesystem/dialog APIs don't exist — so the vault won't even connect. Always use **`npm run tauri dev`** for the real app.

### Build (.app / .dmg)

```bash
npm run tauri build
```

Outputs:

- App bundle → `src-tauri/target/release/bundle/macos/omd.app`
- Disk image → `src-tauri/target/release/bundle/dmg/omd_<version>_aarch64.dmg`

Then install as described in [Install](#install-download).

---

## Tech stack

[Tauri 2](https://tauri.app) (Rust shell) · [React 19](https://react.dev) + TypeScript + [Vite](https://vite.dev) · [Milkdown / Crepe](https://milkdown.dev) (WYSIWYG) · [CodeMirror 6](https://codemirror.net) (source) · [dnd-kit](https://dndkit.com) (drag & drop) · [lucide](https://lucide.dev) (icons).

Deletion uses the OS trash via the Rust [`trash`](https://crates.io/crates/trash) crate; window state is persisted with `tauri-plugin-window-state`.

## Project layout

```
src/                 # React frontend
├─ App.tsx           # central state: tabs, navigation, areas, file ops
├─ components/       # Editor, KanbanBoard, FileTreeView, FolderView, TabBar, …
│  └─ wikilink.ts    # [[ ]] ProseMirror plugin (decorations + click + autocomplete)
├─ fs/               # vault.ts (Tauri path-based fs), frontmatter.ts, store.ts
└─ names.ts          # display-name / slug helpers
src-tauri/           # Rust shell: commands (move_to_trash, open_window), capabilities
```

## License

[MIT](./LICENSE) © dogoyster
