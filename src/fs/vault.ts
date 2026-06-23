import type { Area, TreeNode, KanbanColumn, KanbanCard, Priority, SearchEntry } from '../types'
import { parseDoc, deriveTitle } from './frontmatter'

/** 칸반 컬럼 표준 순서. 이 외의 폴더는 알파벳순으로 뒤에 붙는다. */
const COLUMN_ORDER = ['1-Todo', '2-In Progress', '3-Ready to Review', '4-Done']
const PROJECTS_DIR = 'Projects'
const IGNORED = new Set(['.DS_Store'])

/** 영역 직하위 핵심 폴더(Inbox/Projects/Archive/_templates)인지 — 삭제·이름변경 보호용. */
const PROTECTED_ROOT = new Set(['Inbox', 'Projects', 'Archive', '_templates'])
export function isProtectedFolder(path: string, kind: 'file' | 'directory'): boolean {
  if (kind !== 'directory') return false
  const parts = path.split('/')
  return parts.length === 2 && PROTECTED_ROOT.has(parts[1])
}

export async function pickVault(): Promise<FileSystemDirectoryHandle> {
  return await window.showDirectoryPicker({ id: 'omd', mode: 'readwrite' })
}

/** readwrite 권한 확보. 이미 granted면 프롬프트 없이 통과. */
export async function ensurePermission(handle: FileSystemHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  return (await handle.requestPermission?.(opts)) === 'granted'
}

export async function getAreaDir(
  root: FileSystemDirectoryHandle,
  area: Area,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await root.getDirectoryHandle(area)
  } catch {
    return null
  }
}

/** area 디렉토리 하위를 재귀로 훑어 트리 구성. 파일 내용은 읽지 않는다(.md 이름만). */
export async function buildTree(
  dir: FileSystemDirectoryHandle,
  basePath: string,
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = []
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.') || IGNORED.has(name)) continue
    const path = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'directory') {
      const dh = handle as FileSystemDirectoryHandle
      nodes.push({ name, kind: 'directory', path, handle: dh, parent: dir, children: await buildTree(dh, path) })
    } else if (name.toLowerCase().endsWith('.md')) {
      nodes.push({ name, kind: 'file', path, handle: handle as FileSystemFileHandle, parent: dir })
    }
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return await file.text()
}

export async function writeFile(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** area의 Projects/ 폴더를 칸반 보드(컬럼+카드)로 로드. 없으면 빈 배열. */
export async function loadBoard(
  areaDir: FileSystemDirectoryHandle,
  area: Area,
): Promise<KanbanColumn[]> {
  let projects: FileSystemDirectoryHandle
  try {
    projects = await areaDir.getDirectoryHandle(PROJECTS_DIR)
  } catch {
    return []
  }

  const dirs = new Map<string, FileSystemDirectoryHandle>()
  for await (const [name, handle] of projects.entries()) {
    if (handle.kind === 'directory' && !name.startsWith('.')) {
      dirs.set(name, handle as FileSystemDirectoryHandle)
    }
  }

  const ordered = [
    ...COLUMN_ORDER.filter((n) => dirs.has(n)),
    ...[...dirs.keys()].filter((n) => !COLUMN_ORDER.includes(n)).sort(),
  ]

  const columns: KanbanColumn[] = []
  for (const name of ordered) {
    const handle = dirs.get(name)!
    const base = `${area}/${PROJECTS_DIR}/${name}`
    columns.push({ name, label: prettyColumn(name), handle, parent: projects, cards: await loadCards(handle, base) })
  }
  return columns
}

function prettyColumn(name: string): string {
  return name.replace(/^\d+[-.]\s*/, '')
}

async function loadCards(dir: FileSystemDirectoryHandle, basePath: string): Promise<KanbanCard[]> {
  const handles: FileSystemFileHandle[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.md')) {
      handles.push(handle as FileSystemFileHandle)
    }
  }
  // 카드별 파일 read를 병렬화 (N개 순차 read의 N+1 지연 회피).
  const cards = await Promise.all(
    handles.map(async (handle) => {
      const text = await readFile(handle)
      const { data, body } = parseDoc(text)
      return {
        name: handle.name,
        title: deriveTitle(body, handle.name),
        path: `${basePath}/${handle.name}`,
        handle,
        meta: data,
      } satisfies KanbanCard
    }),
  )
  cards.sort(
    (a, b) => priorityRank(a.meta.priority) - priorityRank(b.meta.priority) || a.title.localeCompare(b.title),
  )
  return cards
}

function priorityRank(p?: Priority): number {
  return p === 'high' ? 0 : p === 'mid' ? 1 : p === 'low' ? 2 : 3
}

/** 카드를 다른 컬럼 폴더로 이동. native move() 우선, 미지원 시 copy+delete 폴백. */
export async function moveCard(
  card: KanbanCard,
  fromCol: KanbanColumn,
  toCol: KanbanColumn,
): Promise<void> {
  const handle = card.handle
  if (typeof handle.move === 'function') {
    await handle.move(toCol.handle, card.name)
    return
  }
  const text = await readFile(handle)
  const dest = await toCol.handle.getFileHandle(card.name, { create: true })
  await writeFile(dest, text)
  await fromCol.handle.removeEntry(card.name)
}

/** 디렉토리에 파일 생성(이미 있으면 덮어쓰기 주의 — 호출부에서 중복 확인). */
export async function createFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content = '',
): Promise<FileSystemFileHandle> {
  const handle = await dir.getFileHandle(name, { create: true })
  await writeFile(handle, content)
  return handle
}

/** 디렉토리에 하위 폴더 생성. 이미 있으면 그대로 둔다. */
export async function createDir(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  await dir.getDirectoryHandle(name, { create: true })
}

/** Projects/ 안에 새 컬럼(폴더)을 만든다. 이미 있으면 그대로 둔다. */
export async function createColumn(areaDir: FileSystemDirectoryHandle, name: string): Promise<void> {
  const projects = await areaDir.getDirectoryHandle(PROJECTS_DIR, { create: true })
  await projects.getDirectoryHandle(name, { create: true })
}

/** 디렉토리 내용을 재귀 복사(텍스트 파일 기준). 컬럼 이름변경 폴백용. */
async function copyDir(src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, handle] of src.entries()) {
    if (handle.kind === 'file') {
      const text = await readFile(handle as FileSystemFileHandle)
      const dest = await dst.getFileHandle(name, { create: true })
      await writeFile(dest, text)
    } else {
      const sub = await dst.getDirectoryHandle(name, { create: true })
      await copyDir(handle as FileSystemDirectoryHandle, sub)
    }
  }
}

/** 파일/폴더 이름변경. native move(name) 우선, 미지원 시 복사 후 원본 삭제. */
export async function renameEntry(
  parent: FileSystemDirectoryHandle,
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  newName: string,
): Promise<void> {
  if (newName === handle.name) return
  if (typeof handle.move === 'function') {
    await handle.move(newName)
    return
  }
  if (handle.kind === 'file') {
    const text = await readFile(handle)
    const dest = await parent.getFileHandle(newName, { create: true })
    await writeFile(dest, text)
  } else {
    const dest = await parent.getDirectoryHandle(newName, { create: true })
    await copyDir(handle, dest)
  }
  await parent.removeEntry(handle.name, { recursive: handle.kind === 'directory' })
}

/** 파일/폴더 삭제. 폴더는 recursive=true로 안의 내용까지 지운다. */
export async function deleteEntry(
  parent: FileSystemDirectoryHandle,
  name: string,
  recursive = false,
): Promise<void> {
  await parent.removeEntry(name, { recursive })
}

async function collectMdFiles(
  dir: FileSystemDirectoryHandle,
  basePath: string,
  out: { handle: FileSystemFileHandle; path: string }[],
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.') || IGNORED.has(name)) continue
    const path = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'directory') {
      await collectMdFiles(handle as FileSystemDirectoryHandle, path, out)
    } else if (name.toLowerCase().endsWith('.md')) {
      out.push({ handle: handle as FileSystemFileHandle, path })
    }
  }
}

/** 영역 전체 .md를 읽어 검색 인덱스를 만든다 (제목 + 본문). */
export async function buildSearchIndex(
  areaDir: FileSystemDirectoryHandle,
  area: Area,
): Promise<SearchEntry[]> {
  const files: { handle: FileSystemFileHandle; path: string }[] = []
  await collectMdFiles(areaDir, area, files)
  // 파일별 read 병렬화
  return Promise.all(
    files.map(async ({ handle, path }) => {
      const text = await readFile(handle)
      const { body } = parseDoc(text)
      const title = deriveTitle(body, handle.name)
      return {
        path,
        name: handle.name,
        title,
        handle,
        haystack: `${title}\n${body}`.toLowerCase(),
        body,
      } satisfies SearchEntry
    }),
  )
}
