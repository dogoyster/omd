import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Area, KanbanCard, KanbanColumn, OpenDoc, SearchEntry, TreeNode } from './types'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { KanbanBoard } from './components/KanbanBoard'
import { SearchModal } from './components/SearchModal'
import { ContextMenu } from './components/ContextMenu'
import type { CtxItem } from './components/ContextMenu'
import { Modal } from './components/Modal'
import type { ModalState } from './components/Modal'
import {
  areaHasContent,
  buildSearchIndex,
  buildTree,
  createColumn,
  createDir,
  createFile,
  deleteEntry,
  isProtectedFolder,
  loadBoard,
  moveCard,
  pickVault,
  renameEntry,
  scaffoldVault,
  setVaultRoot,
} from './fs/vault'
import { loadVaultPath, saveVaultPath } from './fs/store'

type View = 'kanban' | 'editor'
type Phase = 'init' | 'need-connect' | 'onboarding' | 'ready'

const DEFAULT_PATH_HINT =
  'Google Drive·iCloud 같은 동기화 폴더 안의 마크다운 폴더를 고르면, 동기화는 OS가 알아서 처리합니다.'

/** 파일/폴더 이름에 쓸 수 없는 문자 제거. */
function sanitizeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '').trim()
}

function App() {
  const [phase, setPhase] = useState<Phase>('init')
  const [vaultPath, setVaultPath] = useState<string | null>(null)
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
  const [modal, setModal] = useState<ModalState | null>(null)

  // window.prompt/confirm 대체 (Tauri 웹뷰 미지원) — Promise로 모달 결과를 기다린다
  function askInput(title: string, initial = ''): Promise<string | null> {
    return new Promise((resolve) => setModal({ kind: 'input', title, initial, resolve }))
  }
  function askConfirm(title: string): Promise<boolean> {
    return new Promise((resolve) => setModal({ kind: 'confirm', title, resolve }))
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

  const reload = useCallback(async () => {
    if (!vaultPath) return
    const [t, b] = await Promise.all([buildTree(area), loadBoard(area)])
    setTree(t)
    setColumns(b)
  }, [vaultPath, area])

  const openSearch = useCallback(async () => {
    if (!vaultPath) return
    setSearchEntries(await buildSearchIndex(area))
    setSearchOpen(true)
  }, [vaultPath, area])

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

  function openNode(node: TreeNode) {
    if (node.kind !== 'file') return
    setDoc({ path: node.path })
    setView('editor')
  }

  function openCard(card: KanbanCard) {
    setDoc({ path: card.path })
    setView('editor')
  }

  function openSearchResult(entry: SearchEntry) {
    setDoc({ path: entry.path })
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
      await moveCard(cardPath, toCol.path)
    } catch (e) {
      setError('이동 실패: ' + String(e))
    }
    void reload()
  }

  async function handleNewCard(col: KanbanColumn) {
    const title = (await askInput('새 카드 제목'))?.trim()
    if (!title) return
    const slug = sanitizeName(title).replace(/\s+/g, '-')
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

  async function handleRenameNode(node: TreeNode) {
    const label = node.kind === 'file' ? '새 파일 이름' : '새 폴더 이름'
    const raw = (await askInput(label, node.name))?.trim()
    if (!raw || raw === node.name) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    const newName =
      node.kind === 'file' && !clean.toLowerCase().endsWith('.md') ? `${clean}.md` : clean
    try {
      await renameEntry(node.path, newName)
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
    if (!(await askConfirm(msg))) return
    try {
      await deleteEntry(node.path, isDir)
      if (doc?.path === node.path) setDoc(null)
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
    const raw = (await askInput('새 컬럼(폴더) 이름 — 예: 5-Blocked'))?.trim()
    if (!raw) return
    const clean = sanitizeName(raw)
    if (!clean) {
      setError('이름에 쓸 수 있는 문자가 없어요.')
      return
    }
    try {
      await createColumn(area, clean)
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
        ? `"${col.label}" 컬럼과 안의 카드 ${col.cards.length}개를 모두 삭제할까요? 되돌릴 수 없어요.`
        : `"${col.label}" 빈 컬럼을 삭제할까요?`
    if (!(await askConfirm(msg))) return
    try {
      await deleteEntry(col.path, true)
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
          <p>이 폴더가 비어 있어요. 기본 구조를 만들까요?</p>
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

  return (
    <div className="app">
      <Sidebar
        vaultName={vaultLabel}
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
      {modal && <Modal state={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

export default App
