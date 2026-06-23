import { mkdir, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
import type { Area, KanbanCard, KanbanColumn, Priority, SearchEntry, TreeNode } from '../types'
import { deriveTitle, parseDoc } from './frontmatter'

const COLUMN_ORDER = ['1-Todo', '2-In Progress', '3-Ready to Review', '4-Done']
const PROJECTS_DIR = 'Projects'
const IGNORED = new Set(['.DS_Store'])
const PROTECTED_ROOT = new Set(['Inbox', 'Projects', 'Archive', '_templates'])

// 선택된 vault 루트(절대 경로). 단일 vault라 모듈 상태로 보관한다.
let vaultRoot = ''

export function setVaultRoot(path: string): void {
  vaultRoot = path
}

export function vaultName(): string {
  return vaultRoot.split('/').filter(Boolean).pop() ?? vaultRoot
}

/** vault 루트 기준 상대 경로 → 절대 경로 */
function abs(relPath: string): string {
  return relPath ? `${vaultRoot}/${relPath}` : vaultRoot
}

/** 영역 직하위 핵심 폴더(Inbox/Projects/Archive/_templates)인지 — 삭제·이름변경 보호용. */
export function isProtectedFolder(path: string, kind: 'file' | 'directory'): boolean {
  if (kind !== 'directory') return false
  const parts = path.split('/')
  return parts.length === 2 && PROTECTED_ROOT.has(parts[1])
}

/** 네이티브 폴더 선택 다이얼로그. 취소 시 null. */
export async function pickVault(): Promise<string | null> {
  const selected = await open({ directory: true, title: 'vault 폴더 선택' })
  return typeof selected === 'string' ? selected : null
}

export async function readFile(relPath: string): Promise<string> {
  return await readTextFile(abs(relPath))
}

export async function writeFile(relPath: string, text: string): Promise<void> {
  await writeTextFile(abs(relPath), text)
}

/** relPath 하위를 재귀로 훑어 트리 구성. */
export async function buildTree(relPath: string): Promise<TreeNode[]> {
  let entries
  try {
    entries = await readDir(abs(relPath))
  } catch {
    return []
  }
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.') || IGNORED.has(e.name)) continue
    const path = relPath ? `${relPath}/${e.name}` : e.name
    if (e.isDirectory) {
      nodes.push({ name: e.name, kind: 'directory', path, children: await buildTree(path) })
    } else if (e.name.toLowerCase().endsWith('.md')) {
      nodes.push({ name: e.name, kind: 'file', path })
    }
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

/** 영역에 내용이 하나라도 있는지 — 빈 영역 판정용. */
export async function areaHasContent(area: Area): Promise<boolean> {
  try {
    const entries = await readDir(abs(area))
    return entries.length > 0
  } catch {
    return false
  }
}

export async function loadBoard(area: Area): Promise<KanbanColumn[]> {
  const projectsRel = `${area}/${PROJECTS_DIR}`
  let entries
  try {
    entries = await readDir(abs(projectsRel))
  } catch {
    return []
  }
  const dirNames = entries.filter((e) => e.isDirectory && !e.name.startsWith('.')).map((e) => e.name)
  const ordered = [
    ...COLUMN_ORDER.filter((n) => dirNames.includes(n)),
    ...dirNames.filter((n) => !COLUMN_ORDER.includes(n)).sort(),
  ]
  const columns: KanbanColumn[] = []
  for (const name of ordered) {
    const colPath = `${projectsRel}/${name}`
    columns.push({ name, label: prettyColumn(name), path: colPath, cards: await loadCards(colPath) })
  }
  return columns
}

function prettyColumn(name: string): string {
  return name.replace(/^\d+[-.]\s*/, '')
}

async function loadCards(colRel: string): Promise<KanbanCard[]> {
  const entries = await readDir(abs(colRel))
  const files = entries.filter((e) => e.isFile && e.name.toLowerCase().endsWith('.md'))
  const cards = await Promise.all(
    files.map(async (e) => {
      const rel = `${colRel}/${e.name}`
      const { data, body } = parseDoc(await readTextFile(abs(rel)))
      return {
        name: e.name,
        title: deriveTitle(body, e.name),
        path: rel,
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

/** 카드를 다른 컬럼 폴더로 이동. */
export async function moveCard(cardPath: string, toColPath: string): Promise<void> {
  const name = cardPath.split('/').pop() ?? cardPath
  await rename(abs(cardPath), abs(`${toColPath}/${name}`))
}

/** 파일/폴더 이름변경(같은 부모 안에서). */
export async function renameEntry(path: string, newName: string): Promise<void> {
  const parent = path.split('/').slice(0, -1).join('/')
  const next = parent ? `${parent}/${newName}` : newName
  if (next === path) return
  await rename(abs(path), abs(next))
}

/** 파일/폴더 삭제. 폴더는 recursive=true. */
export async function deleteEntry(path: string, recursive = false): Promise<void> {
  await remove(abs(path), { recursive })
}

export async function createFile(dirPath: string, name: string, content = ''): Promise<void> {
  await writeTextFile(abs(`${dirPath}/${name}`), content)
}

export async function createDir(dirPath: string, name: string): Promise<void> {
  await mkdir(abs(`${dirPath}/${name}`))
}

/** Projects/ 안에 새 컬럼(폴더). */
export async function createColumn(area: Area, name: string): Promise<void> {
  await mkdir(abs(`${area}/${PROJECTS_DIR}/${name}`), { recursive: true })
}

/** 빈 vault에 기본 구조(영역 · Inbox · Projects 스테이지 · Archive · _templates)를 생성. */
export async function scaffoldVault(): Promise<void> {
  for (const area of ['Work', 'Personal'] as const) {
    await mkdir(abs(`${area}/Inbox`), { recursive: true })
    await mkdir(abs(`${area}/Archive`), { recursive: true })
    for (const stage of COLUMN_ORDER) {
      await mkdir(abs(`${area}/${PROJECTS_DIR}/${stage}`), { recursive: true })
    }
  }
  await mkdir(abs('_templates'), { recursive: true })
}

async function collectMd(relPath: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readDir(abs(relPath))
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || IGNORED.has(e.name)) continue
    const path = relPath ? `${relPath}/${e.name}` : e.name
    if (e.isDirectory) await collectMd(path, out)
    else if (e.name.toLowerCase().endsWith('.md')) out.push(path)
  }
}

/** 영역 전체 .md를 읽어 검색 인덱스 구성. */
export async function buildSearchIndex(area: Area): Promise<SearchEntry[]> {
  const files: string[] = []
  await collectMd(area, files)
  return Promise.all(
    files.map(async (rel) => {
      const { body } = parseDoc(await readTextFile(abs(rel)))
      const name = rel.split('/').pop() ?? rel
      const title = deriveTitle(body, name)
      return {
        path: rel,
        name,
        title,
        haystack: `${title}\n${body}`.toLowerCase(),
        body,
      } satisfies SearchEntry
    }),
  )
}
