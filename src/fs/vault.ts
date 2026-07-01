import { mkdir, readDir, readTextFile, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import type { Area, KanbanCard, KanbanColumn, Priority, SearchEntry, TreeNode } from '../types'
import { deriveTitle, extractTitle, parseDoc } from './frontmatter'

const COLUMN_ORDER = ['1-Todo', '2-In Progress', '3-Ready to Review', '4-Done']
const PROJECTS_DIR = 'Projects'
const IGNORED = new Set(['.DS_Store'])

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

/** 네이티브 폴더 선택 다이얼로그. 취소 시 null. */
export async function pickVault(): Promise<string | null> {
  const selected = await open({ directory: true, title: 'vault 폴더 선택' })
  return typeof selected === 'string' ? selected : null
}

/** 임의 폴더 선택(백업 대상 등). 취소 시 null. */
export async function pickFolder(title: string): Promise<string | null> {
  const selected = await open({ directory: true, title })
  return typeof selected === 'string' ? selected : null
}

/** 현재 vault를 대상 폴더로 미러링(로컬 → Drive 폴더 백업). 복사된 파일 수 반환. */
export async function mirrorVault(targetAbs: string): Promise<number> {
  return await invoke<number>('mirror_dir', { src: vaultRoot, dst: targetAbs })
}

export async function readFile(relPath: string): Promise<string> {
  return await readTextFile(abs(relPath))
}

export async function writeFile(relPath: string, text: string): Promise<void> {
  await writeTextFile(abs(relPath), text)
}

export interface EntryStat {
  /** 수정 시각 (epoch ms) */
  modified: number | null
  /** 생성 시각 (epoch ms) */
  created: number | null
}

/** 경로 존재 여부 (이름 충돌 검사용). */
export async function pathExists(relPath: string): Promise<boolean> {
  try {
    await stat(abs(relPath))
    return true
  } catch {
    return false
  }
}

export async function statEntry(relPath: string): Promise<EntryStat> {
  const info = await stat(abs(relPath))
  return {
    modified: info.mtime ? info.mtime.getTime() : null,
    created: info.birthtime ? info.birthtime.getTime() : null,
  }
}

/** relPath 하위를 재귀로 훑어 트리 구성. 파일은 본문 H1을 읽어 title로 담는다. */
export async function buildTree(relPath: string): Promise<TreeNode[]> {
  let entries
  try {
    entries = await readDir(abs(relPath))
  } catch {
    return []
  }
  const visible = entries.filter(
    (e) =>
      !e.name.startsWith('.') &&
      !IGNORED.has(e.name) &&
      (e.isDirectory || e.name.toLowerCase().endsWith('.md')),
  )
  // 파일 read(H1 추출)·하위 디렉토리 재귀를 병렬로 — 순차 read의 N+1 지연 회피
  const nodes = await Promise.all(
    visible.map(async (e): Promise<TreeNode> => {
      const path = relPath ? `${relPath}/${e.name}` : e.name
      if (e.isDirectory) {
        return { name: e.name, kind: 'directory', path, children: await buildTree(path) }
      }
      const { body } = parseDoc(await readTextFile(abs(path)))
      return { name: e.name, kind: 'file', path, title: extractTitle(body) }
    }),
  )
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

/** 디렉토리의 하위 폴더 = 컬럼, 각 폴더 안의 .md = 카드. 어떤 폴더든 칸반으로 볼 수 있다. */
export async function loadBoardFromDir(dirRel: string): Promise<KanbanColumn[]> {
  let entries
  try {
    entries = await readDir(abs(dirRel))
  } catch {
    return []
  }
  const dirNames = entries
    .filter((e) => e.isDirectory && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
  const columns: KanbanColumn[] = []
  for (const name of dirNames) {
    const colPath = `${dirRel}/${name}`
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

/** 파일/폴더를 다른 디렉토리로 이동 (칸반 카드 이동 · 트리 드래그 공용). */
export async function moveEntry(srcPath: string, toDirPath: string): Promise<void> {
  const name = srcPath.split('/').pop() ?? srcPath
  await rename(abs(srcPath), abs(`${toDirPath}/${name}`))
}

/** 파일/폴더 이름변경(같은 부모 안에서). */
export async function renameEntry(path: string, newName: string): Promise<void> {
  const parent = path.split('/').slice(0, -1).join('/')
  const next = parent ? `${parent}/${newName}` : newName
  if (next === path) return
  await rename(abs(path), abs(next))
}

/** 파일/폴더를 OS 휴지통으로 이동(영구삭제 아님). 폴더는 통째로 이동된다.
 * Rust `move_to_trash` 커맨드를 거쳐 std::fs::remove의 클라우드 볼륨 실패 문제를 피한다. */
export async function deleteEntry(path: string): Promise<void> {
  await invoke('move_to_trash', { path: abs(path) })
}

export async function createFile(dirPath: string, name: string, content = ''): Promise<void> {
  await writeTextFile(abs(`${dirPath}/${name}`), content)
}

export async function createDir(dirPath: string, name: string): Promise<void> {
  await mkdir(abs(`${dirPath}/${name}`))
}

/** 현재 보고 있는 디렉토리 안에 새 컬럼(하위 폴더). */
export async function createColumn(dirRel: string, name: string): Promise<void> {
  await mkdir(abs(`${dirRel}/${name}`), { recursive: true })
}

/** 경로의 디렉토리를 보장(없으면 생성). */
export async function ensureDir(relPath: string): Promise<void> {
  await mkdir(abs(relPath), { recursive: true })
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
