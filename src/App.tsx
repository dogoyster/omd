import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Area, KanbanCard, KanbanColumn, OpenDoc, SearchEntry, TreeNode } from './types'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { KanbanBoard } from './components/KanbanBoard'
import { SearchModal } from './components/SearchModal'
import { ContextMenu } from './components/ContextMenu'
import type { CtxItem } from './components/ContextMenu'
import {
  buildSearchIndex,
  buildTree,
  createColumn,
  createDir,
  createFile,
  deleteEntry,
  ensurePermission,
  getAreaDir,
  isProtectedFolder,
  loadBoard,
  moveCard,
  pickVault,
  renameEntry,
} from './fs/vault'
import { loadVaultHandle, saveVaultHandle } from './fs/idb'

type View = 'kanban' | 'editor'
type Phase = 'init' | 'need-connect' | 'need-permission' | 'ready' | 'unsupported'

const DEFAULT_PATH_HINT =
  'Google Drive·iCloud 같은 동기화 폴더 안의 마크다운 폴더를 고르면, 동기화는 OS가 알아서 처리합니다.'

/** 파일/폴더 이름에 쓸 수 없는 문자 제거. */
function sanitizeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '').trim()
}

function App() {
  const [phase, setPhase] = useState<Phase>('init')
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [pending, setPending] = useState<FileSystemDirectoryHandle | null>(null)
  const [area, setArea] = useState<Area>(
    () => (localStorage.getItem('omd.area') as Area | null) ?? 'Work',
  )
  const [view, setView] = useState<View>(
    () => (localStorage.getItem('omd.view') as View | null) ?? 'kanban',
  )
  const [tree, setTree] = useState<TreeNode[]>([])
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([])
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null)

  // 브라우저 지원 확인 + 저장된 vault 핸들 복원
  useEffect(() => {
    if (typeof window.showDirectoryPicker !== 'function') {
      setPhase('unsupported')
      return
    }
    let cancelled = false
    loadVaultHandle().then(async (saved) => {
      if (cancelled) return
      if (!saved) {
        setPhase('need-connect')
        return
      }
      const state = (await saved.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt'
      if (state === 'granted') {
        setRoot(saved)
        setPhase('ready')
      } else {
        // 권한 재요청은 사용자 제스처(클릭) 안에서만 가능
        setPending(saved)
        setPhase('need-permission')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    if (!root) return
    const areaDir = await getAreaDir(root, area)
    if (!areaDir) {
      setTree([])
      setColumns([])
      return
    }
    const [t, b] = await Promise.all([buildTree(areaDir, area), loadBoard(areaDir, area)])
    setTree(t)
    setColumns(b)
  }, [root, area])

  const openSearch = useCallback(async () => {
    if (!root) return
    const areaDir = await getAreaDir(root, area)
    if (!areaDir) {
      setError('이 영역에 폴더가 없어요.')
      return
    }
    setSearchEntries(await buildSearchIndex(areaDir, area))
    setSearchOpen(true)
  }, [root, area])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    localStorage.setItem('omd.area', area)
  }, [area])

  useEffect(() => {
    localStorage.setItem('omd.view', view)
  }, [view])

  // ⌘K / Ctrl+K → 검색 모달
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        void openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  async function connect() {
    try {
      const handle = await pickVault()
      await saveVaultHandle(handle)
      setRoot(handle)
      setPending(null)
      setPhase('ready')
      setError(null)
    } catch (e) {
      // 사용자가 picker를 취소하면 AbortError — 조용히 무시
      if ((e as DOMException)?.name !== 'AbortError') setError(String(e))
    }
  }

  async function grant() {
    if (!pending) return
    const ok = await ensurePermission(pending)
    if (ok) {
      setRoot(pending)
      setPending(null)
      setPhase('ready')
    } else {
      setError('폴더 접근 권한이 거부됐어요.')
    }
  }

  function openNode(node: TreeNode) {
    if (node.kind !== 'file') return
    setDoc({ path: node.path, handle: node.handle as FileSystemFileHandle })
    setView('editor')
  }

  function openCard(card: KanbanCard) {
    setDoc({ path: card.path, handle: card.handle })
    setView('editor')
  }

  function openSearchResult(entry: SearchEntry) {
    setDoc({ path: entry.path, handle: entry.handle })
    setView('editor')
    setSearchOpen(false)
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
      await moveCard(card, fromCol, toCol)
    } catch (e) {
      setError('이동 실패: ' + String(e))
    }
    // 경로/핸들을 실제 파일 위치와 정합화
    void reload()
  }

  async function handleNewCard(col: KanbanColumn) {
    const title = window.prompt('새 카드 제목')?.trim()
    if (!title) return
    const slug = title.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '-')
    const today = new Date().toISOString().slice(0, 10)
    const content = `---\nproject: \npriority: mid\ncreated: ${today}\ndue: \ntags: []\nsource: \n---\n\n# ${title}\n\n`
    try {
      await createFile(col.handle, `${slug}.md`, content)
      await reload()
    } catch (e) {
      setError('생성 실패: ' + String(e))
    }
  }

  async function handleRenameNode(node: TreeNode) {
    const label = node.kind === 'file' ? '새 파일 이름' : '새 폴더 이름'
    const raw = window.prompt(label, node.name)?.trim()
    if (!raw || raw === node.name) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    const newName =
      node.kind === 'file' && !clean.toLowerCase().endsWith('.md') ? `${clean}.md` : clean
    try {
      await renameEntry(node.parent, node.handle, newName)
      if (doc?.path === node.path) setDoc(null)
      await reload()
    } catch (e) {
      setError('이름변경 실패: ' + String(e))
    }
  }

  async function handleDeleteNode(node: TreeNode) {
    const isDir = node.kind === 'directory'
    const msg = isDir
      ? `"${node.name}" 폴더와 그 안의 내용을 모두 삭제할까요? 되돌릴 수 없어요.`
      : `"${node.name}" 파일을 삭제할까요? 되돌릴 수 없어요.`
    if (!window.confirm(msg)) return
    try {
      await deleteEntry(node.parent, node.name, isDir)
      if (doc?.path === node.path) setDoc(null)
      await reload()
    } catch (e) {
      setError('삭제 실패: ' + String(e))
    }
  }

  async function handleNewFile(node: TreeNode) {
    if (node.kind !== 'directory') return
    const raw = window.prompt('새 파일 이름')?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    const filename = clean.toLowerCase().endsWith('.md') ? clean : `${clean}.md`
    const title = filename.replace(/\.md$/i, '')
    try {
      await createFile(node.handle as FileSystemDirectoryHandle, filename, `# ${title}\n\n`)
      await reload()
    } catch (e) {
      setError('파일 생성 실패: ' + String(e))
    }
  }

  async function handleNewFolder(node: TreeNode) {
    if (node.kind !== 'directory') return
    const raw = window.prompt('새 폴더 이름')?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await createDir(node.handle as FileSystemDirectoryHandle, clean)
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
      items.push({ label: '＋ 새 파일', onClick: () => void handleNewFile(node) })
      items.push({ label: '＋ 새 폴더', onClick: () => void handleNewFolder(node) })
    } else {
      items.push({ label: '열기', onClick: () => openNode(node) })
    }
    if (!isProtectedFolder(node.path, node.kind)) {
      items.push({ label: '이름변경', onClick: () => void handleRenameNode(node) })
      items.push({ label: '삭제', onClick: () => void handleDeleteNode(node), danger: true })
    }
    return items
  }

  async function handleAddColumn() {
    if (!root) return
    const raw = window.prompt('새 컬럼(폴더) 이름 — 예: 5-Blocked')?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    const areaDir = await getAreaDir(root, area)
    if (!areaDir) {
      setError('이 영역에 폴더가 없어요.')
      return
    }
    try {
      await createColumn(areaDir, clean)
      await reload()
    } catch (e) {
      setError('컬럼 생성 실패: ' + String(e))
    }
  }

  async function handleRenameColumn(col: KanbanColumn) {
    const raw = window.prompt('컬럼 폴더 이름 (예: 5-Blocked)', col.name)?.trim()
    if (!raw || raw === col.name) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await renameEntry(col.parent, col.handle, clean)
      await reload()
    } catch (e) {
      setError('컬럼 이름변경 실패: ' + String(e))
    }
  }

  async function handleDeleteColumn(col: KanbanColumn) {
    const msg =
      col.cards.length > 0
        ? `"${col.label}" 컬럼과 안의 카드 ${col.cards.length}개를 모두 삭제할까요? 되돌릴 수 없어요.`
        : `"${col.label}" 빈 컬럼을 삭제할까요?`
    if (!window.confirm(msg)) return
    try {
      await deleteEntry(col.parent, col.name, true)
      await reload()
    } catch (e) {
      setError('컬럼 삭제 실패: ' + String(e))
    }
  }

  if (phase === 'unsupported') {
    return (
      <div className="splash">
        <div className="splash-card">
          <h1>이 브라우저는 지원하지 않아요</h1>
          <p>로컬 폴더 직접 접근(File System Access API)이 필요합니다. 데스크톱 Chrome 또는 Edge에서 열어주세요.</p>
        </div>
      </div>
    )
  }

  if (phase === 'init') {
    return <div className="splash"><div className="splash-card"><p>불러오는 중…</p></div></div>
  }

  if (phase !== 'ready' || !root) {
    return (
      <div className="splash">
        <div className="splash-card">
          <h1>omd</h1>
          {phase === 'need-permission' ? (
            <>
              <p>저장된 vault 폴더에 다시 접근하려면 권한을 허용해 주세요.</p>
              <button className="btn-primary" onClick={() => void grant()}>
                폴더 접근 허용
              </button>
            </>
          ) : (
            <>
              <p>마크다운 vault 폴더를 연결하세요.</p>
              <button className="btn-primary" onClick={() => void connect()}>
                vault 폴더 연결
              </button>
              <p className="path-hint">{DEFAULT_PATH_HINT}</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        vaultName={root.name}
        area={area}
        view={view}
        tree={tree}
        selectedPath={doc?.path ?? null}
        onAreaChange={setArea}
        onViewChange={setView}
        onSelect={openNode}
        onReconnect={() => void connect()}
        onSearch={() => void openSearch()}
        onRename={handleRenameNode}
        onDelete={handleDeleteNode}
        onContextMenu={handleTreeContextMenu}
      />
      <main className="main">
        {view === 'kanban' ? (
          <KanbanBoard
            columns={columns}
            selectedPath={doc?.path ?? null}
            onMove={handleMove}
            onOpenCard={openCard}
            onNewCard={handleNewCard}
            onAddColumn={handleAddColumn}
            onRenameColumn={handleRenameColumn}
            onDeleteColumn={handleDeleteColumn}
          />
        ) : doc ? (
          <Editor key={doc.path} doc={doc} />
        ) : (
          <div className="placeholder">왼쪽에서 파일을 선택하세요.</div>
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
    </div>
  )
}

export default App
