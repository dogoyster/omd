import type { MouseEvent } from 'react'
import type { Area, TreeNode } from '../types'
import { FileTreeView } from './FileTreeView'

type View = 'kanban' | 'editor'

const AREAS: Area[] = ['Work', 'Personal']

interface Props {
  vaultName: string
  area: Area
  view: View
  tree: TreeNode[]
  selectedPath: string | null
  onAreaChange: (area: Area) => void
  onViewChange: (view: View) => void
  onSelect: (node: TreeNode) => void
  onReconnect: () => void
  onSearch: () => void
  onRename: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onContextMenu: (e: MouseEvent, node: TreeNode) => void
}

export function Sidebar({
  vaultName,
  area,
  view,
  tree,
  selectedPath,
  onAreaChange,
  onViewChange,
  onSelect,
  onReconnect,
  onSearch,
  onRename,
  onDelete,
  onContextMenu,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="vault-head">
        <span className="vault-name" title={vaultName}>
          📁 {vaultName}
        </span>
        <button className="icon-btn" title="검색 (⌘K)" onClick={onSearch}>
          🔍
        </button>
        <button className="icon-btn" title="다른 폴더 연결" onClick={onReconnect}>
          ⤺
        </button>
      </div>

      <div className="seg area-seg">
        {AREAS.map((a) => (
          <button
            key={a}
            className={'seg-btn' + (area === a ? ' on' : '')}
            onClick={() => onAreaChange(a)}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="seg view-seg">
        <button
          className={'seg-btn' + (view === 'kanban' ? ' on' : '')}
          onClick={() => onViewChange('kanban')}
        >
          칸반
        </button>
        <button
          className={'seg-btn' + (view === 'editor' ? ' on' : '')}
          onClick={() => onViewChange('editor')}
        >
          파일
        </button>
      </div>

      <div className="tree-wrap">
        {tree.length === 0 ? (
          <p className="empty-note">이 영역에 폴더가 없어요.</p>
        ) : (
          <FileTreeView
            nodes={tree}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onContextMenu={onContextMenu}
          />
        )}
      </div>
    </aside>
  )
}
