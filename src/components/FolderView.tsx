import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Folder } from 'lucide-react'
import type { TreeNode } from '../types'
import { displayName } from '../names'
import { statEntry } from '../fs/vault'
import type { EntryStat } from '../fs/vault'

interface Props {
  entries: TreeNode[]
  /** stats를 다시 읽을 기준 — 디렉토리가 바뀌면 재로드. */
  dirPath: string
  onOpenFile: (node: TreeNode, newTab?: boolean) => void
  onOpenDir: (node: TreeNode, newTab?: boolean) => void
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

/** 디렉토리 내용을 본문에 리스트로 표출 (Finder식 탐색 + 수정/생성일, 컬럼 정렬). */
export function FolderView({ entries, dirPath, onOpenFile, onOpenDir }: Props) {
  const [stats, setStats] = useState<Record<string, EntryStat>>({})
  const [sort, setSort] = useState<Sort>(loadSort)

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

  // 폴더 먼저, 그 다음 파일 — 각 그룹을 선택한 기준으로 정렬.
  const sorted = useMemo(() => {
    const nameOf = (n: TreeNode) => (n.title || displayName(n.name)).toLowerCase()
    const cmp = (a: TreeNode, b: TreeNode) => {
      let r: number
      if (sort.key === 'name') r = nameOf(a).localeCompare(nameOf(b))
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
      <ul className="folder-list">
        <li className="folder-item head">
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
          <li
            key={c.path}
            className="folder-item"
            onClick={(e) => {
              const newTab = e.metaKey || e.ctrlKey
              if (c.kind === 'directory') onOpenDir(c, newTab)
              else onOpenFile(c, newTab)
            }}
          >
            <span className="fi-icon">
              {c.kind === 'directory' ? <Folder size={16} /> : <FileText size={16} />}
            </span>
            <span className="fi-name">{c.title || displayName(c.name)}</span>
            <span className="fi-meta">
              <span className="fi-date" title="수정일">
                {fmtDate(stats[c.path]?.modified ?? null)}
              </span>
              <span className="fi-date sub" title="생성일">
                {fmtDate(stats[c.path]?.created ?? null)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
