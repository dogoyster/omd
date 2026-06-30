import type { MouseEvent } from 'react'
import { FolderInput, FolderPlus, PanelLeftClose, Plus, Search, Settings } from 'lucide-react'
import type { Area, TreeNode } from '../types'
import { stripMd } from '../names'
import { FileTreeView } from './FileTreeView'

const AREAS: Area[] = ['Work', 'Personal']

interface Props {
  vaultName: string
  area: Area
  tree: TreeNode[]
  /** 에디터로 열린 파일 경로 (트리 하이라이트용) */
  selectedPath: string | null
  /** 본문에 열린 디렉토리 경로 (트리 하이라이트용) */
  selectedDirPath: string | null
  onAreaChange: (area: Area) => void
  onSelect: (node: TreeNode, newTab?: boolean) => void
  onOpenDir: (node: TreeNode, newTab?: boolean) => void
  onNewTopDir: () => void
  onMove: (srcPath: string, toDirPath: string) => void
  onReconnect: () => void
  onSearch: () => void
  onNewNote: () => void
  onSettings: () => void
  onToggleSidebar: () => void
  onContextMenu: (e: MouseEvent, node: TreeNode) => void
}

export function Sidebar({
  vaultName,
  area,
  tree,
  selectedPath,
  selectedDirPath,
  onAreaChange,
  onSelect,
  onOpenDir,
  onNewTopDir,
  onMove,
  onReconnect,
  onSearch,
  onNewNote,
  onSettings,
  onToggleSidebar,
  onContextMenu,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="vault-head">
        <span className="vault-name" title={vaultName}>
          {stripMd(vaultName)}
        </span>
        <button className="icon-btn" title="검색 (⌘K)" onClick={onSearch} aria-label="검색">
          <Search size={16} />
        </button>
        <button className="icon-btn" title="설정" onClick={onSettings} aria-label="설정">
          <Settings size={16} />
        </button>
        <button
          className="icon-btn"
          title="다른 폴더 연결"
          onClick={onReconnect}
          aria-label="다른 폴더 연결"
        >
          <FolderInput size={16} />
        </button>
        <button
          className="icon-btn"
          title="사이드바 닫기 (⌘\\)"
          onClick={onToggleSidebar}
          aria-label="사이드바 닫기"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button className="new-note-btn" onClick={onNewNote}>
        <Plus size={16} /> 새 노트
      </button>

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

      <div className="tree-head">
        <span className="tree-head-label">폴더</span>
        <button className="tree-add-btn" title="새 최상위 폴더" onClick={onNewTopDir} aria-label="새 폴더">
          <FolderPlus size={15} />
        </button>
      </div>

      <div className="tree-wrap">
        {tree.length === 0 ? (
          <p className="empty-note">이 영역에 폴더가 없어요.</p>
        ) : (
          <FileTreeView
            nodes={tree}
            selectedPath={selectedPath}
            selectedDirPath={selectedDirPath}
            onSelect={onSelect}
            onOpenDir={onOpenDir}
            onMove={onMove}
            onContextMenu={onContextMenu}
          />
        )}
      </div>
    </aside>
  )
}
