import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { ChevronDown, ChevronUp, FileText, Folder, GripVertical } from 'lucide-react'
import type { TreeNode } from '../types'
import { nodeLabel } from '../names'
import { statEntry } from '../fs/vault'
import type { EntryStat } from '../fs/vault'

interface Props {
  entries: TreeNode[]
  /** stats를 다시 읽을 기준 — 디렉토리가 바뀌면 재로드. */
  dirPath: string
  onOpenFile: (node: TreeNode, newTab?: boolean) => void
  onOpenDir: (node: TreeNode, newTab?: boolean) => void
  onMove: (srcPath: string, toDirPath: string) => void
}

type SortKey = 'name' | 'modified' | 'created'
type SortDir = 'asc' | 'desc'
interface Sort {
  key: SortKey
  dir: SortDir
}

function loadSort(): Sort {
  try {
    const s = JSON.parse(localStorage.getItem('omd.listSort') || '')
    if (s && (s.key === 'name' || s.key === 'modified' || s.key === 'created')) return s
  } catch {
    /* 기본값 사용 */
  }
  return { key: 'name', dir: 'asc' }
}

function fmtDate(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 디렉토리 내용을 본문에 리스트로 표출 (탐색 + 수정/생성일, 컬럼 정렬, 드래그 이동). */
export function FolderView({ entries, dirPath, onOpenFile, onOpenDir, onMove }: Props) {
  const [stats, setStats] = useState<Record<string, EntryStat>>({})
  const [sort, setSort] = useState<Sort>(loadSort)
  // 5px 이상 움직여야 드래그 시작 → 단순 클릭(열기)과 구분
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    let cancelled = false
    Promise.all(entries.map(async (c) => [c.path, await statEntry(c.path)] as const))
      .then((pairs) => {
        if (!cancelled) setStats(Object.fromEntries(pairs))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // dirPath가 같으면 동일 내용 — 디렉토리 단위로만 재로드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirPath])

  useEffect(() => {
    localStorage.setItem('omd.listSort', JSON.stringify(sort))
  }, [sort])

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    )
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return // 폴더가 아닌 곳에 놓으면 무시
    const src = String(active.id)
    const to = String(over.id)
    if (src !== to) onMove(src, to)
  }

  // 폴더 먼저, 그 다음 파일 — 각 그룹을 선택한 기준으로 정렬.
  const sorted = useMemo(() => {
    const cmp = (a: TreeNode, b: TreeNode) => {
      let r: number
      if (sort.key === 'name') r = nodeLabel(a).toLowerCase().localeCompare(nodeLabel(b).toLowerCase())
      else r = (stats[a.path]?.[sort.key] ?? 0) - (stats[b.path]?.[sort.key] ?? 0)
      return sort.dir === 'asc' ? r : -r
    }
    const dirs = entries.filter((e) => e.kind === 'directory').sort(cmp)
    const files = entries.filter((e) => e.kind === 'file').sort(cmp)
    return [...dirs, ...files]
  }, [entries, stats, sort])

  if (entries.length === 0) {
    return <div className="placeholder">빈 폴더예요.</div>
  }

  const caret = (key: SortKey) =>
    sort.key === key ? (
      sort.dir === 'asc' ? (
        <ChevronUp size={12} />
      ) : (
        <ChevronDown size={12} />
      )
    ) : null

  return (
    <div className="folder-view">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <ul className="folder-list">
          <li className="folder-item head">
            <span className="row-grip" aria-hidden="true" />
            <span className="fi-icon" />
            <button className="fi-name sort-col" onClick={() => toggleSort('name')}>
              이름 {caret('name')}
            </button>
            <span className="fi-meta">
              <button className="fi-date sort-col" onClick={() => toggleSort('modified')}>
                수정일 {caret('modified')}
              </button>
              <button className="fi-date sub sort-col" onClick={() => toggleSort('created')}>
                생성일 {caret('created')}
              </button>
            </span>
          </li>
          {sorted.map((c) => (
            <FolderRow
              key={c.path}
              node={c}
              stat={stats[c.path]}
              onOpenFile={onOpenFile}
              onOpenDir={onOpenDir}
            />
          ))}
        </ul>
      </DndContext>
    </div>
  )
}

interface RowProps {
  node: TreeNode
  stat?: EntryStat
  onOpenFile: (node: TreeNode, newTab?: boolean) => void
  onOpenDir: (node: TreeNode, newTab?: boolean) => void
}

function FolderRow({ node, stat, onOpenFile, onOpenDir }: RowProps) {
  const drag = useDraggable({ id: node.path })
  // 폴더만 드롭 타겟
  const drop = useDroppable({ id: node.path, disabled: node.kind !== 'directory' })
  const setRefs = (el: HTMLElement | null) => {
    drag.setNodeRef(el)
    if (node.kind === 'directory') drop.setNodeRef(el)
  }
  return (
    <li
      ref={setRefs}
      className={
        'folder-item' +
        (drop.isOver ? ' drop-over' : '') +
        (drag.isDragging ? ' dragging-source' : '')
      }
      onClick={(e) => {
        const newTab = e.metaKey || e.ctrlKey
        if (node.kind === 'directory') onOpenDir(node, newTab)
        else onOpenFile(node, newTab)
      }}
    >
      {/* 왼쪽 드래그 핸들 — 이것만 잡아서 이동(행 클릭은 열기). 폴더 행 위에 놓으면 이동. */}
      <button
        className="row-grip"
        title="드래그하여 폴더로 이동"
        aria-label="이동"
        onClick={(e) => e.stopPropagation()}
        {...drag.listeners}
        {...drag.attributes}
      >
        <GripVertical size={14} />
      </button>
      <span className="fi-icon">
        {node.kind === 'directory' ? <Folder size={16} /> : <FileText size={16} />}
      </span>
      <span className="fi-name">{nodeLabel(node)}</span>
      <span className="fi-meta">
        <span className="fi-date" title="수정일">
          {fmtDate(stat?.modified ?? null)}
        </span>
        <span className="fi-date sub" title="생성일">
          {fmtDate(stat?.created ?? null)}
        </span>
      </span>
    </li>
  )
}
