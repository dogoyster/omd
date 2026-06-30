import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, LayoutGrid, List } from 'lucide-react'
import type { Area, KanbanCard, KanbanColumn, SearchEntry, TreeNode } from './types'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { KanbanBoard } from './components/KanbanBoard'
import { SearchModal } from './components/SearchModal'
import { ContextMenu } from './components/ContextMenu'
import type { CtxItem } from './components/ContextMenu'
import { Modal } from './components/Modal'
import type { ModalState } from './components/Modal'
import { FolderView } from './components/FolderView'
import { SettingsModal } from './components/SettingsModal'
import type { Theme } from './components/SettingsModal'
import { TabBar } from './components/TabBar'
import { displayName, nodeLabel, stripMd } from './names'
import {
  areaHasContent,
  buildSearchIndex,
  buildTree,
  createColumn,
  createDir,
  createFile,
  deleteEntry,
  ensureDir,
  loadBoardFromDir,
  moveEntry,
  pathExists,
  pickVault,
  readFile,
  renameEntry,
  scaffoldVault,
  setVaultRoot,
  writeFile,
} from './fs/vault'
import { extractTitle, setTitle, splitFrontmatter } from './fs/frontmatter'
import { loadVaultPath, saveVaultPath } from './fs/store'
import { invoke } from '@tauri-apps/api/core'

/** 본문 화면: 디렉토리(리스트/칸반) 또는 에디터. */
type View = 'dir' | 'editor'
/** 디렉토리를 보는 방식. */
type DirMode = 'list' | 'kanban'

/** 한 화면 상태(탭 내용·히스토리 항목 공용). */
interface NavState {
  view: View
  docPath: string | null
  dirPath: string
  dirMode: DirMode
}
/** 탭 = 화면 상태 + 자체 뒤/앞 히스토리. */
interface Tab extends NavState {
  id: number
  back: NavState[]
  forward: NavState[]
}
type Phase = 'init' | 'need-connect' | 'onboarding' | 'ready'

const DEFAULT_PATH_HINT =
  'Google Drive·iCloud 같은 동기화 폴더 안의 마크다운 폴더를 고르면, 동기화는 OS가 알아서 처리합니다.'

const initialArea = (): Area => (localStorage.getItem('omd.area') as Area | null) ?? 'Work'

/** 파일/폴더 이름에 쓸 수 없는 문자 제거. */
function sanitizeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '').trim()
}

/** 제목 → 파일명 슬러그 (끝의 .md 제거 후 공백을 하이픈으로). displayName의 역변환.
 * .md를 먼저 떼지 않으면 "files.md" 같은 H1이 "files.md.md" 파일을 만든다. */
function slugify(title: string): string {
  return sanitizeName(stripMd(title)).replace(/\s+/g, '-')
}

/** tree에서 path로 노드 찾기 (reload 후에도 최신 노드 참조). */
function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const found = findNode(n.children, path)
      if (found) return found
    }
  }
  return null
}

/** 현재 영역 트리의 디렉토리 목록(영역 prefix 제거한 상대 경로) — 설정의 기본 폴더 선택지. */
function collectDirOptions(nodes: TreeNode[], area: Area): string[] {
  const out: string[] = []
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.kind === 'directory') {
        out.push(n.path.startsWith(`${area}/`) ? n.path.slice(area.length + 1) : n.path)
        if (n.children) walk(n.children)
      }
    }
  }
  walk(nodes)
  return out
}

/** 트리의 모든 노트(파일)를 {제목, 경로}로 평탄화 — 위키링크 자동완성·해석용. */
function collectNotes(nodes: TreeNode[], out: { title: string; path: string }[] = []) {
  for (const n of nodes) {
    if (n.kind === 'file') out.push({ title: nodeLabel(n), path: n.path })
    if (n.children) collectNotes(n.children, out)
  }
  return out
}

// 디렉토리별 보기 방식(리스트/칸반)을 경로 단위로 기억한다.
function loadDirModes(): Record<string, DirMode> {
  try {
    return JSON.parse(localStorage.getItem('omd.dirModes') || '{}')
  } catch {
    return {}
  }
}
function getDirMode(path: string): DirMode {
  return loadDirModes()[path] ?? 'list'
}
function rememberDirMode(path: string, mode: DirMode): void {
  const m = loadDirModes()
  m[path] = mode
  localStorage.setItem('omd.dirModes', JSON.stringify(m))
}

/** 새 창이 열릴 때 URL 쿼리(?doc= 또는 ?dir=&mode=)로 전달된 "열 대상". 없으면 null. */
function parseOpenTarget(): NavState | null {
  const raw = location.search || location.hash.replace(/^#/, '?')
  const qs = new URLSearchParams(raw)
  const doc = qs.get('doc')
  if (doc) {
    const dir = doc.split('/').slice(0, -1).join('/')
    return { view: 'editor', docPath: doc, dirPath: dir, dirMode: getDirMode(dir) }
  }
  const dir = qs.get('dir')
  if (dir) {
    return { view: 'dir', docPath: null, dirPath: dir, dirMode: qs.get('mode') === 'kanban' ? 'kanban' : 'list' }
  }
  return null
}

const snap = (t: NavState): NavState => ({
  view: t.view,
  docPath: t.docPath,
  dirPath: t.dirPath,
  dirMode: t.dirMode,
})

function App() {
  const [phase, setPhase] = useState<Phase>('init')
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  // 새 창이면 열 대상의 영역을, 아니면 저장된 영역을 초기 영역으로.
  const [area, setArea] = useState<Area>(() => {
    const p = parseOpenTarget()?.dirPath
    if (p?.startsWith('Personal')) return 'Personal'
    if (p?.startsWith('Work')) return 'Work'
    return initialArea()
  })

  // 탭 — 각 탭은 독립적인 화면 + 뒤/앞 히스토리를 가진다. (새 창이면 전달된 대상으로 시작)
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const target = parseOpenTarget()
    const base: NavState = target ?? {
      view: 'dir',
      docPath: null,
      dirPath: initialArea(),
      dirMode: getDirMode(initialArea()),
    }
    return [{ id: 1, ...base, back: [], forward: [] }]
  })
  const [activeId, setActiveId] = useState(1)
  const tabSeq = useRef(1)
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const [tree, setTree] = useState<TreeNode[]>([])
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([])
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('omd.theme') as Theme | null) ?? 'system',
  )
  const [defaultDir, setDefaultDir] = useState<string>(() => localStorage.getItem('omd.defaultDir') ?? '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => localStorage.getItem('omd.sidebarOpen') !== 'false',
  )
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const n = Number(localStorage.getItem('omd.sidebarWidth'))
    return n >= 180 && n <= 520 ? n : 260
  })
  const [conflicts, setConflicts] = useState<string[]>([])
  const [conflictDismissed, setConflictDismissed] = useState<Record<string, boolean>>({})

  // window.prompt/confirm 대체 (Tauri 웹뷰 미지원) — Promise로 모달 결과를 기다린다
  function askInput(title: string, initial = ''): Promise<string | null> {
    return new Promise((resolve) => setModal({ kind: 'input', title, initial, resolve }))
  }
  function askConfirm(title: string): Promise<boolean> {
    return new Promise((resolve) => setModal({ kind: 'confirm', title, resolve }))
  }

  // ---- 탭/히스토리 조작 ----
  // 현재 탭을 새 화면으로 이동(현재 상태는 back에 쌓고 forward는 비움).
  function navigate(next: NavState) {
    setTabs((ts) =>
      ts.map((t) => (t.id === activeId ? { ...t, ...next, back: [...t.back, snap(t)], forward: [] } : t)),
    )
  }
  // 히스토리 없이 현재 탭 일부만 변경(모드 토글·경로 갱신 등).
  function patchActive(patch: Partial<NavState>) {
    setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
  }
  function openInNewTab(next: NavState) {
    const id = (tabSeq.current += 1)
    setTabs((ts) => [...ts, { id, ...next, back: [], forward: [] }])
    setActiveId(id)
  }
  // 같은 프론트엔드를 로드하는 새 OS 창을 연다. 무엇을 열지는 URL 쿼리로 전달.
  function openInNewWindow(next: NavState) {
    const params = new URLSearchParams()
    let title = 'omd'
    if (next.view === 'editor' && next.docPath) {
      params.set('doc', next.docPath)
      title = displayName(next.docPath.split('/').pop() ?? 'omd')
    } else {
      params.set('dir', next.dirPath)
      params.set('mode', next.dirMode)
      title = next.dirPath === area ? area : displayName(next.dirPath.split('/').pop() ?? next.dirPath)
    }
    const label = `omd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    void invoke('open_window', { label, url: `index.html?${params.toString()}`, title }).catch((e) =>
      setError('새 창 열기 실패: ' + String(e)),
    )
  }
  function closeTab(id: number) {
    if (tabs.length === 1) return // 최소 1개 유지
    const idx = tabs.findIndex((t) => t.id === id)
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id)
  }
  function goBack() {
    setTabs((ts) =>
      ts.map((t) => {
        if (t.id !== activeId || t.back.length === 0) return t
        const prev = t.back[t.back.length - 1]
        return { ...t, ...prev, back: t.back.slice(0, -1), forward: [...t.forward, snap(t)] }
      }),
    )
  }
  function goForward() {
    setTabs((ts) =>
      ts.map((t) => {
        if (t.id !== activeId || t.forward.length === 0) return t
        const nx = t.forward[t.forward.length - 1]
        return { ...t, ...nx, forward: t.forward.slice(0, -1), back: [...t.back, snap(t)] }
      }),
    )
  }
  // 파일 경로 변경(이동·이름변경)을 모든 탭/히스토리에 반영.
  function patchPath(oldPath: string, newPath: string) {
    const fix = (s: NavState): NavState => (s.docPath === oldPath ? { ...s, docPath: newPath } : s)
    setTabs((ts) =>
      ts.map((t) => ({
        ...t,
        docPath: t.docPath === oldPath ? newPath : t.docPath,
        back: t.back.map(fix),
        forward: t.forward.map(fix),
      })),
    )
  }
  // 삭제된 경로를 가리키는 탭은 디렉토리 보기로 되돌린다(없어진 파일/폴더 노출 방지).
  function dropPath(path: string) {
    const under = (p: string | null) => !!p && (p === path || p.startsWith(path + '/'))
    setTabs((ts) =>
      ts.map((t) => {
        const docGone = under(t.docPath)
        const dirGone = under(t.dirPath)
        if (!docGone && !dirGone) return t
        return {
          ...t,
          view: 'dir',
          docPath: docGone ? null : t.docPath,
          dirPath: dirGone ? area : t.dirPath,
        }
      }),
    )
  }

  // 저장된 vault 경로 복원
  useEffect(() => {
    const saved = loadVaultPath()
    if (saved) {
      void activateVault(saved, false)
    } else {
      setPhase('need-connect')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 사이드바 트리는 영역 단위로만 다시 읽는다 (디렉토리 이동 시엔 재구성 불필요).
  const reloadTree = useCallback(async () => {
    if (!vaultPath) return
    setTree(await buildTree(area))
  }, [vaultPath, area])

  // 칸반 보드는 현재 탭이 칸반일 때만 카드를 읽는다.
  const reloadBoard = useCallback(async () => {
    if (!vaultPath || active.view !== 'dir' || active.dirMode !== 'kanban') return
    setColumns(await loadBoardFromDir(active.dirPath))
  }, [vaultPath, active.view, active.dirMode, active.dirPath])

  // 파일 변경(이동·생성·삭제·이름변경) 후엔 트리·보드 둘 다 갱신.
  const reload = useCallback(async () => {
    await Promise.all([reloadTree(), reloadBoard()])
  }, [reloadTree, reloadBoard])

  const openSearch = useCallback(async () => {
    if (!vaultPath) return
    setSearchEntries(await buildSearchIndex(area))
    setSearchOpen(true)
  }, [vaultPath, area])

  useEffect(() => {
    void reloadTree()
  }, [reloadTree])

  useEffect(() => {
    void reloadBoard()
  }, [reloadBoard])

  // 창이 다시 포커스되면 트리·보드를 갱신 — 클라우드(구글드라이브 등)가 외부에서
  // 추가/수정한 파일을 반영한다. (열어둔 문서의 외부 변경은 Editor가 별도 처리)
  useEffect(() => {
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  // Crepe 표의 행/열 드래그 이동은 native HTML5 `drop`에서 커밋되는데, `drop`은
  // 직전 `dragover`에서 preventDefault가 있어야 발화한다. Crepe는 셀에만 걸어둬서
  // 드래그 프리뷰 오버레이 위에서 떼면 drop이 안 떠 이동이 커밋되지 않는다 → 전역 보장.
  // (dnd-kit 칸반/트리/리스트는 포인터 기반이라 영향 없음.)
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', onDragOver)
    return () => window.removeEventListener('dragover', onDragOver)
  }, [])

  // 동기화 충돌 사본 감지: 같은 폴더에 "X.md"가 있는데 "X (n).md"도 있거나, 이름에 conflict 포함.
  useEffect(() => {
    const out: string[] = []
    const walk = (ns: TreeNode[]) => {
      const names = new Set(ns.filter((n) => n.kind === 'file').map((n) => n.name.toLowerCase()))
      for (const n of ns) {
        if (n.kind === 'file') {
          const m = /^(.*) \(\d+\)\.md$/i.exec(n.name)
          if (/conflict/i.test(n.name) || (m && names.has(`${m[1].toLowerCase()}.md`))) out.push(n.path)
        }
        if (n.children) walk(n.children)
      }
    }
    walk(tree)
    setConflicts(out)
  }, [tree])

  useEffect(() => {
    localStorage.setItem('omd.area', area)
  }, [area])

  useEffect(() => {
    localStorage.setItem('omd.theme', theme)
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('omd.defaultDir', defaultDir)
  }, [defaultDir])

  useEffect(() => {
    localStorage.setItem('omd.sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    localStorage.setItem('omd.sidebarWidth', String(sidebarWidth))
  }, [sidebarWidth])

  // 사이드바 우측 경계 드래그로 폭 조절 (180~520px).
  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const onMove = (ev: PointerEvent) => setSidebarWidth(Math.min(520, Math.max(180, ev.clientX)))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 단축키 — 최신 핸들러를 ref로 참조해 한 번만 구독한다.
  const keysRef = useRef<{ [k: string]: () => void }>({})
  keysRef.current = {
    search: () => void openSearch(),
    newNote: () => void handleNewNote(),
    toggleSidebar: () => setSidebarOpen((o) => !o),
    back: goBack,
    forward: goForward,
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const s = keysRef.current
      if (k === 'k') {
        e.preventDefault()
        s.search()
      } else if (k === 'n') {
        e.preventDefault()
        s.newNote()
      } else if (e.key === '\\') {
        e.preventDefault()
        s.toggleSidebar()
      } else if (e.key === '[') {
        e.preventDefault()
        s.back()
      } else if (e.key === ']') {
        e.preventDefault()
        s.forward()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function activateVault(path: string, save: boolean) {
    setVaultRoot(path)
    if (save) saveVaultPath(path)
    setVaultPath(path)
    // vault가 완전히 비었으면(영역 폴더 없음) 온보딩으로
    const empty = !(await areaHasContent('Work')) && !(await areaHasContent('Personal'))
    setPhase(empty ? 'onboarding' : 'ready')
    setError(null)
  }

  async function connect() {
    const path = await pickVault()
    if (!path) return // 취소
    await activateVault(path, true)
  }

  async function handleScaffold() {
    try {
      await scaffoldVault()
      setPhase('ready')
      await reload()
    } catch (e) {
      setError('초기화 실패: ' + String(e))
    }
  }

  function changeArea(a: Area) {
    setArea(a)
    navigate({ view: 'dir', docPath: null, dirPath: a, dirMode: getDirMode(a) })
  }

  function openNode(node: TreeNode, newTab = false) {
    if (node.kind !== 'file') return
    const next: NavState = {
      view: 'editor',
      docPath: node.path,
      dirPath: active.dirPath,
      dirMode: active.dirMode,
    }
    newTab ? openInNewTab(next) : navigate(next)
  }

  function handleOpenDir(node: TreeNode, newTab = false) {
    const next: NavState = {
      view: 'dir',
      docPath: null,
      dirPath: node.path,
      dirMode: getDirMode(node.path),
    }
    newTab ? openInNewTab(next) : navigate(next)
  }

  function openDirAs(node: TreeNode, mode: DirMode) {
    rememberDirMode(node.path, mode)
    navigate({ view: 'dir', docPath: null, dirPath: node.path, dirMode: mode })
  }

  function switchDirMode(mode: DirMode) {
    rememberDirMode(active.dirPath, mode)
    patchActive({ dirMode: mode })
  }

  function openCard(card: KanbanCard) {
    navigate({ view: 'editor', docPath: card.path, dirPath: active.dirPath, dirMode: active.dirMode })
  }

  function openSearchResult(entry: SearchEntry) {
    navigate({ view: 'editor', docPath: entry.path, dirPath: active.dirPath, dirMode: active.dirMode })
    setSearchOpen(false)
  }

  // 위키링크 [[대상]] 클릭 → 제목 → 파일명(.md 제거) → 슬러그 순으로 해석해 그 노트로 이동.
  function handleWikilink(target: string) {
    const t = target.toLowerCase()
    const tslug = slugify(target).toLowerCase()
    const notes = collectNotes(tree)
    const hit =
      notes.find((n) => n.title.toLowerCase() === t) ??
      notes.find((n) => stripMd(n.path.split('/').pop() ?? '').toLowerCase() === t) ??
      notes.find((n) => slugify(n.title).toLowerCase() === tslug)
    if (hit) {
      navigate({
        view: 'editor',
        docPath: hit.path,
        dirPath: hit.path.split('/').slice(0, -1).join('/'),
        dirMode: active.dirMode,
      })
    } else {
      setError(`'${target}' 노트를 찾을 수 없어요`)
    }
  }

  // 저장 직후: 본문 H1 → 파일명 동기화 후 트리·보드 갱신.
  async function handleDocSaved(savedPath: string, savedText: string) {
    try {
      const h1 = extractTitle(splitFrontmatter(savedText).body)
      if (h1) {
        const slug = slugify(h1)
        const base = (savedPath.split('/').pop() ?? '').replace(/\.md$/i, '')
        if (slug && slug !== base) {
          const parent = savedPath.split('/').slice(0, -1).join('/')
          const newName = `${slug}.md`
          const newRel = parent ? `${parent}/${newName}` : newName
          // macOS는 대소문자 무시 → 같은 파일의 대소문자/하이픈 변경은 충돌이 아니다
          const sameFile = newRel.toLowerCase() === savedPath.toLowerCase()
          if (!sameFile && (await pathExists(newRel))) {
            setError('같은 이름의 파일이 있어 파일명은 그대로 두었어요.')
          } else {
            await renameEntry(savedPath, newName)
            patchPath(savedPath, newRel)
          }
        }
      }
    } catch (e) {
      setError('파일명 동기화 실패: ' + String(e))
    }
    await reload()
  }

  async function handleMove(cardPath: string, fromColName: string, toColName: string) {
    const fromCol = columns.find((c) => c.name === fromColName)
    const toCol = columns.find((c) => c.name === toColName)
    if (!fromCol || !toCol) return
    const card = fromCol.cards.find((c) => c.path === cardPath)
    if (!card) return

    // 낙관적 업데이트 — 드래그 직후 즉시 반영
    setColumns((prev) =>
      prev.map((c) => {
        if (c.name === fromColName) return { ...c, cards: c.cards.filter((x) => x.path !== cardPath) }
        if (c.name === toColName) return { ...c, cards: [...c.cards, card] }
        return c
      }),
    )

    try {
      await moveEntry(cardPath, toCol.path)
      patchPath(cardPath, `${toCol.path}/${cardPath.split('/').pop()}`)
    } catch (e) {
      setError('이동 실패: ' + String(e))
    }
    void reload()
  }

  async function handleTreeMove(srcPath: string, toDirPath: string) {
    if (toDirPath === srcPath || toDirPath.startsWith(`${srcPath}/`)) return // 자기 자신/자손엔 불가
    const srcParent = srcPath.split('/').slice(0, -1).join('/')
    if (srcParent === toDirPath) return // 이미 그 폴더에 있음
    try {
      await moveEntry(srcPath, toDirPath)
      patchPath(srcPath, `${toDirPath}/${srcPath.split('/').pop()}`)
      await reload()
    } catch (e) {
      setError('이동 실패: ' + String(e))
    }
  }

  async function handleNewCard(col: KanbanColumn) {
    const title = (await askInput('새 카드 제목'))?.trim()
    if (!title) return
    const slug = slugify(title)
    if (!slug) {
      setError('제목에 쓸 수 있는 문자가 없어요.')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const content = `---\nproject: \npriority: mid\ncreated: ${today}\ndue: \ntags: []\nsource: \n---\n\n# ${title}\n\n`
    try {
      await createFile(col.path, `${slug}.md`, content)
      await reload()
    } catch (e) {
      setError('생성 실패: ' + String(e))
    }
  }

  async function handleNewNote() {
    // 제목 모달 없이 — 빈 제목(H1) 노트를 만들어 열고, 에디터가 제목에 포커스 + '무제' placeholder.
    // 파일명은 임시('무제…'); 제목을 입력해 저장하면 H1→파일명 동기화로 자동 변경된다.
    const dir = `${area}/${defaultDir || 'Inbox'}` // 설정의 기본 폴더(없으면 Inbox)
    const today = new Date().toISOString().slice(0, 10)
    const content = `---\nproject: \npriority: mid\ncreated: ${today}\ndue: \ntags: []\nsource: \n---\n\n# \n`
    try {
      await ensureDir(dir)
      let name = '무제.md'
      let n = 2
      while (await pathExists(`${dir}/${name}`)) name = `무제 ${n++}.md`
      await createFile(dir, name, content)
      navigate({ view: 'editor', docPath: `${dir}/${name}`, dirPath: dir, dirMode: active.dirMode })
      await reload()
    } catch (e) {
      setError('노트 생성 실패: ' + String(e))
    }
  }

  // 현재 영역 최상위에 새 폴더 추가 (Inbox/Projects/Archive 외에 자유롭게).
  async function handleNewTopDir() {
    const raw = (await askInput(`새 최상위 폴더 — ${area} 영역`))?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await createDir(area, clean)
      await reloadTree()
    } catch (e) {
      setError('폴더 생성 실패: ' + String(e))
    }
  }

  async function handleRenameNode(node: TreeNode) {
    if (node.kind === 'directory') {
      const raw = (await askInput('새 폴더 이름', node.name))?.trim()
      if (!raw || raw === node.name) return
      const clean = sanitizeName(raw)
      if (!clean) {
        setError('이름에 쓸 수 있는 문자가 없어요.')
        return
      }
      try {
        await renameEntry(node.path, clean)
        await reload()
      } catch (e) {
        setError('이름변경 실패: ' + String(e))
      }
      return
    }

    // 파일: 제목 = 파일명. 파일명을 바꾸면 본문 H1도 맞춘다 (파일명 → H1).
    const current = node.title || displayName(node.name)
    const raw = (await askInput('새 제목 (파일명도 함께 바뀝니다)', current))?.trim()
    if (!raw) return
    const clean = sanitizeName(raw.replace(/\.md$/i, ''))
    const slug = slugify(clean)
    if (!slug) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    const parent = node.path.split('/').slice(0, -1).join('/')
    const newName = `${slug}.md`
    const newRel = parent ? `${parent}/${newName}` : newName
    try {
      const sameFile = newRel.toLowerCase() === node.path.toLowerCase()
      if (!sameFile && (await pathExists(newRel))) {
        setError('같은 이름의 파일이 이미 있어요.')
        return
      }
      let finalPath = node.path
      if (newRel !== node.path) {
        await renameEntry(node.path, newName)
        finalPath = newRel
      }
      // 본문 H1을 새 제목으로 교체 (frontmatter 보존)
      const { frontmatter, body } = splitFrontmatter(await readFile(finalPath))
      await writeFile(finalPath, frontmatter + setTitle(body, clean))
      patchPath(node.path, finalPath)
      await reload()
    } catch (e) {
      setError('이름변경 실패: ' + String(e))
    }
  }

  async function handleDeleteNode(node: TreeNode) {
    const isDir = node.kind === 'directory'
    const msg = isDir
      ? `"${node.name}" 폴더와 그 안의 내용을 휴지통으로 보낼까요?`
      : `"${node.name}" 파일을 휴지통으로 보낼까요?`
    if (!(await askConfirm(msg))) return
    try {
      await deleteEntry(node.path)
      dropPath(node.path)
      await reload()
    } catch (e) {
      setError('삭제 실패: ' + String(e))
    }
  }

  async function handleNewFile(node: TreeNode) {
    if (node.kind !== 'directory') return
    const raw = (await askInput('새 파일 이름'))?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    const filename = clean.toLowerCase().endsWith('.md') ? clean : `${clean}.md`
    const title = filename.replace(/\.md$/i, '')
    try {
      await createFile(node.path, filename, `# ${title}\n\n`)
      await reload()
    } catch (e) {
      setError('파일 생성 실패: ' + String(e))
    }
  }

  async function handleNewFolder(node: TreeNode) {
    if (node.kind !== 'directory') return
    const raw = (await askInput('새 폴더 이름'))?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await createDir(node.path, clean)
      await reload()
    } catch (e) {
      setError('폴더 생성 실패: ' + String(e))
    }
  }

  function handleTreeContextMenu(e: MouseEvent, node: TreeNode) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }

  function buildCtxItems(node: TreeNode): CtxItem[] {
    const items: CtxItem[] = []
    if (node.kind === 'directory') {
      items.push({ label: '리스트로 열기', onClick: () => openDirAs(node, 'list') })
      items.push({ label: '칸반으로 열기', onClick: () => openDirAs(node, 'kanban') })
      items.push({ label: '새 탭으로 열기', onClick: () => handleOpenDir(node, true) })
      items.push({
        label: '새 창에서 열기',
        onClick: () =>
          openInNewWindow({ view: 'dir', docPath: null, dirPath: node.path, dirMode: getDirMode(node.path) }),
      })
      items.push({ label: '＋ 새 파일', onClick: () => void handleNewFile(node) })
      items.push({ label: '＋ 새 폴더', onClick: () => void handleNewFolder(node) })
    } else {
      items.push({ label: '열기', onClick: () => openNode(node) })
      items.push({ label: '새 탭으로 열기', onClick: () => openNode(node, true) })
      items.push({
        label: '새 창에서 열기',
        onClick: () =>
          openInNewWindow({
            view: 'editor',
            docPath: node.path,
            dirPath: node.path.split('/').slice(0, -1).join('/'),
            dirMode: 'list',
          }),
      })
    }
    items.push({ label: '이름변경', onClick: () => void handleRenameNode(node) })
    items.push({ label: '삭제', onClick: () => void handleDeleteNode(node), danger: true })
    return items
  }

  async function handleAddColumn() {
    const raw = (await askInput('새 컬럼(폴더) 이름 — 예: 5-Blocked'))?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await createColumn(active.dirPath, clean)
      await reload()
    } catch (e) {
      setError('컬럼 생성 실패: ' + String(e))
    }
  }

  async function handleRenameColumn(col: KanbanColumn) {
    const raw = (await askInput('컬럼 폴더 이름 (예: 5-Blocked)', col.name))?.trim()
    if (!raw || raw === col.name) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await renameEntry(col.path, clean)
      await reload()
    } catch (e) {
      setError('컬럼 이름변경 실패: ' + String(e))
    }
  }

  async function handleDeleteColumn(col: KanbanColumn) {
    const msg =
      col.cards.length > 0
        ? `"${col.label}" 컬럼과 안의 카드 ${col.cards.length}개를 휴지통으로 보낼까요?`
        : `"${col.label}" 빈 컬럼을 휴지통으로 보낼까요?`
    if (!(await askConfirm(msg))) return
    try {
      await deleteEntry(col.path)
      dropPath(col.path)
      await reload()
    } catch (e) {
      setError('컬럼 삭제 실패: ' + String(e))
    }
  }

  if (phase === 'init') {
    return (
      <div className="splash">
        <div className="splash-card">
          <p>불러오는 중…</p>
        </div>
      </div>
    )
  }

  if (phase === 'onboarding') {
    return (
      <div className="splash">
        <div className="splash-card">
          <h1>omd 시작하기</h1>
          <p>이 폴더가 비어 있어요. 기본 구조를 만들까요? (나중에 자유롭게 추가·삭제할 수 있어요)</p>
          <pre className="onboard-tree">{`Work/ · Personal/
├─ Inbox/
├─ Projects/{1-Todo, 2-In Progress, 3-Ready to Review, 4-Done}/
└─ Archive/`}</pre>
          <button className="btn-primary" onClick={() => void handleScaffold()}>
            기본 구조 만들기
          </button>
          <button className="btn-text" onClick={() => setPhase('ready')}>
            빈 채로 시작
          </button>
        </div>
      </div>
    )
  }

  if (phase !== 'ready' || !vaultPath) {
    return (
      <div className="splash">
        <div className="splash-card">
          <h1>omd</h1>
          <p>마크다운 vault 폴더를 연결하세요.</p>
          <button className="btn-primary" onClick={() => void connect()}>
            vault 폴더 연결
          </button>
          <p className="path-hint">{DEFAULT_PATH_HINT}</p>
        </div>
      </div>
    )
  }

  const vaultLabel = vaultPath.split('/').filter(Boolean).pop() ?? vaultPath
  const dirNode = active.dirPath === area ? null : findNode(tree, active.dirPath)
  const dirChildren = active.dirPath === area ? tree : (dirNode?.children ?? [])
  const dirTitle = active.dirPath === area ? area : displayName(dirNode?.name ?? active.dirPath)
  const dirOptions = collectDirOptions(tree, area)
  const noteIndex = collectNotes(tree)
  const activeConflicts = conflicts.filter((p) => !conflictDismissed[p])

  const tabItems = tabs.map((t) => {
    let title: string
    if (t.view === 'editor' && t.docPath) {
      const n = findNode(tree, t.docPath)
      title = n ? nodeLabel(n) : displayName(t.docPath.split('/').pop() ?? t.docPath)
    } else {
      title = t.dirPath === area ? area : displayName(t.dirPath.split('/').pop() ?? t.dirPath)
    }
    return { id: t.id, title, kind: t.view === 'editor' ? ('file' as const) : ('dir' as const), active: t.id === activeId }
  })

  return (
    <div
      className={'app' + (sidebarOpen ? '' : ' sidebar-collapsed')}
      style={{ gridTemplateColumns: sidebarOpen ? `${sidebarWidth}px 1fr` : '1fr' }}
    >
      <Sidebar
        vaultName={vaultLabel}
        area={area}
        tree={tree}
        selectedPath={active.view === 'editor' ? active.docPath : null}
        selectedDirPath={active.view === 'dir' ? active.dirPath : null}
        onAreaChange={changeArea}
        onSelect={openNode}
        onOpenDir={handleOpenDir}
        onNewTopDir={() => void handleNewTopDir()}
        onMove={handleTreeMove}
        onReconnect={() => void connect()}
        onSearch={() => void openSearch()}
        onNewNote={() => void handleNewNote()}
        onSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onContextMenu={handleTreeContextMenu}
      />
      {sidebarOpen && (
        <div
          className="sidebar-resizer"
          style={{ left: sidebarWidth }}
          onPointerDown={startResize}
          title="드래그하여 사이드바 폭 조절"
        />
      )}
      <main className="main">
        {activeConflicts.length > 0 && (
          <div className="conflict-banner">
            <span>
              동기화 충돌 사본 {activeConflicts.length}개 감지됨 — Drive 동기화 충돌일 수 있어요.
            </span>
            <button
              onClick={() =>
                navigate({
                  view: 'editor',
                  docPath: activeConflicts[0],
                  dirPath: activeConflicts[0].split('/').slice(0, -1).join('/'),
                  dirMode: active.dirMode,
                })
              }
            >
              열기
            </button>
            <button
              className="ghost"
              onClick={() =>
                setConflictDismissed((d) => {
                  const next = { ...d }
                  activeConflicts.forEach((p) => (next[p] = true))
                  return next
                })
              }
            >
              닫기
            </button>
          </div>
        )}
        <TabBar
          tabs={tabItems}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onActivate={setActiveId}
          onClose={closeTab}
          onNew={() =>
            openInNewTab({ view: 'dir', docPath: null, dirPath: area, dirMode: getDirMode(area) })
          }
        />
        {active.view === 'editor' && active.docPath ? (
          <Editor
            key={active.id + ':' + active.docPath}
            doc={{ path: active.docPath }}
            onBack={active.back.length > 0 ? goBack : undefined}
            onForward={active.forward.length > 0 ? goForward : undefined}
            onSaved={(p, t) => void handleDocSaved(p, t)}
            notes={noteIndex}
            onWikilink={handleWikilink}
          />
        ) : (
          <div className="dir-pane">
            <header className="dir-head">
              <div className="nav-btns">
                <button
                  className="back-btn"
                  onClick={goBack}
                  disabled={active.back.length === 0}
                  title="뒤로 (⌘[)"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  className="back-btn"
                  onClick={goForward}
                  disabled={active.forward.length === 0}
                  title="앞으로 (⌘])"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
              <span className="dir-title" title={active.dirPath}>
                {dirTitle}
              </span>
              <div className="seg dir-mode-seg">
                <button
                  className={'seg-btn' + (active.dirMode === 'list' ? ' on' : '')}
                  onClick={() => switchDirMode('list')}
                  title="리스트로 보기"
                >
                  <List size={14} /> 리스트
                </button>
                <button
                  className={'seg-btn' + (active.dirMode === 'kanban' ? ' on' : '')}
                  onClick={() => switchDirMode('kanban')}
                  title="칸반으로 보기"
                >
                  <LayoutGrid size={14} /> 칸반
                </button>
              </div>
              <span className="spacer" />
              <span className="dir-count">{dirChildren.length}개</span>
            </header>
            {active.dirMode === 'kanban' ? (
              <KanbanBoard
                columns={columns}
                onMove={handleMove}
                onOpenCard={openCard}
                onNewCard={handleNewCard}
                onAddColumn={handleAddColumn}
                onRenameColumn={handleRenameColumn}
                onDeleteColumn={handleDeleteColumn}
              />
            ) : (
              <FolderView
                entries={dirChildren}
                dirPath={active.dirPath}
                onOpenFile={openNode}
                onOpenDir={handleOpenDir}
                onMove={handleTreeMove}
              />
            )}
          </div>
        )}
      </main>
      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {searchOpen && (
        <SearchModal
          entries={searchEntries}
          onClose={() => setSearchOpen(false)}
          onOpen={openSearchResult}
        />
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxItems(ctxMenu.node)}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {modal && <Modal state={modal} onClose={() => setModal(null)} />}
      {settingsOpen && (
        <SettingsModal
          theme={theme}
          defaultDir={defaultDir}
          dirOptions={dirOptions}
          area={area}
          onThemeChange={setTheme}
          onDefaultDirChange={setDefaultDir}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
