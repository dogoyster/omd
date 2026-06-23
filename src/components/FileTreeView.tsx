import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { TreeNode } from '../types'
import { isProtectedFolder } from '../fs/vault'

interface Props {
  nodes: TreeNode[]
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
  onRename: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onContextMenu: (e: MouseEvent, node: TreeNode) => void
}

export function FileTreeView({ nodes, selectedPath, onSelect, onRename, onDelete, onContextMenu }: Props) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onContextMenu={onContextMenu}
          depth={0}
        />
      ))}
    </ul>
  )
}

interface RowActionsProps {
  node: TreeNode
  onRename: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
}

function RowActions({ node, onRename, onDelete }: RowActionsProps) {
  return (
    <span className="row-actions">
      <button
        title="이름변경"
        onClick={(e) => {
          e.stopPropagation()
          onRename(node)
        }}
      >
        ✎
      </button>
      <button
        title="삭제"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(node)
        }}
      >
        🗑
      </button>
    </span>
  )
}

interface ItemProps {
  node: TreeNode
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
  onRename: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onContextMenu: (e: MouseEvent, node: TreeNode) => void
  depth: number
}

function TreeItem({ node, selectedPath, onSelect, onRename, onDelete, onContextMenu, depth }: ItemProps) {
  const [open, setOpen] = useState(depth < 1)
  const pad = { paddingLeft: depth * 12 + 8 }

  if (node.kind === 'directory') {
    const children = node.children ?? []
    const locked = isProtectedFolder(node.path, node.kind)
    return (
      <li>
        <div
          className="tree-row dir"
          style={pad}
          onClick={() => setOpen((o) => !o)}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          <span className="caret">{children.length > 0 ? (open ? '▾' : '▸') : ''}</span>
          <span className="tree-name">{node.name}</span>
          {!locked && <RowActions node={node} onRename={onRename} onDelete={onDelete} />}
        </div>
        {open && children.length > 0 && (
          <ul className="tree">
            {children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onContextMenu={onContextMenu}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li>
      <div
        className={'tree-row file' + (selectedPath === node.path ? ' active' : '')}
        style={pad}
        onClick={() => onSelect(node)}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="caret" />
        <span className="tree-name">{node.name.replace(/\.md$/i, '')}</span>
        <RowActions node={node} onRename={onRename} onDelete={onDelete} />
      </div>
    </li>
  )
}
