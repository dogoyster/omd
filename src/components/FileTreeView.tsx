import { useState } from 'react'
import type { MouseEvent } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react'
import type { TreeNode } from '../types'
import { nodeLabel } from '../names'

interface Props {
  nodes: TreeNode[]
  selectedPath: string | null
  selectedDirPath: string | null
  onSelect: (node: TreeNode, newTab?: boolean) => void
  onOpenDir: (node: TreeNode, newTab?: boolean) => void
  onMove: (srcPath: string, toDirPath: string) => void
  onContextMenu: (e: MouseEvent, node: TreeNode) => void
}

export function FileTreeView({
  nodes,
  selectedPath,
  selectedDirPath,
  onSelect,
  onOpenDir,
  onMove,
  onContextMenu,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const src = String(active.id)
    const to = String(over.id)
    if (src !== to) onMove(src, to)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <ul className="tree">
        {nodes.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            selectedPath={selectedPath}
            selectedDirPath={selectedDirPath}
            onSelect={onSelect}
            onOpenDir={onOpenDir}
            onContextMenu={onContextMenu}
            depth={0}
          />
        ))}
      </ul>
    </DndContext>
  )
}

interface ItemProps {
  node: TreeNode
  selectedPath: string | null
  selectedDirPath: string | null
  onSelect: (node: TreeNode, newTab?: boolean) => void
  onOpenDir: (node: TreeNode, newTab?: boolean) => void
  onContextMenu: (e: MouseEvent, node: TreeNode) => void
  depth: number
}

function TreeItem({
  node,
  selectedPath,
  selectedDirPath,
  onSelect,
  onOpenDir,
  onContextMenu,
  depth,
}: ItemProps) {
  const [open, setOpen] = useState(depth < 1)
  const pad = { paddingLeft: depth * 12 + 8 }
  const drag = useDraggable({ id: node.path })
  // 폴더만 드롭 타겟
  const drop = useDroppable({ id: node.path, disabled: node.kind !== 'directory' })

  if (node.kind === 'directory') {
    const children = node.children ?? []
    const setRefs = (el: HTMLElement | null) => {
      drag.setNodeRef(el)
      drop.setNodeRef(el)
    }
    return (
      <li>
        <div
          ref={setRefs}
          className={
            'tree-row dir' +
            (selectedDirPath === node.path ? ' active' : '') +
            (drop.isOver ? ' drop-over' : '') +
            (drag.isDragging ? ' dragging-source' : '')
          }
          style={pad}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              onOpenDir(node, true) // ⌘클릭 → 새 탭 (펼침은 토글하지 않음)
              return
            }
            setOpen((o) => !o)
            onOpenDir(node, false)
          }}
          onContextMenu={(e) => onContextMenu(e, node)}
          {...drag.listeners}
          {...drag.attributes}
        >
          <span className="caret">
            {children.length > 0 ? (
              open ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )
            ) : null}
          </span>
          <span className="tree-icon">
            <Folder size={15} />
          </span>
          <span className="tree-name">{nodeLabel(node)}</span>
        </div>
        {open && children.length > 0 && (
          <ul className="tree">
            {children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                selectedDirPath={selectedDirPath}
                onSelect={onSelect}
                onOpenDir={onOpenDir}
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
        ref={drag.setNodeRef}
        className={
          'tree-row file' +
          (selectedPath === node.path ? ' active' : '') +
          (drag.isDragging ? ' dragging-source' : '')
        }
        style={pad}
        onClick={(e) => onSelect(node, e.metaKey || e.ctrlKey)}
        onContextMenu={(e) => onContextMenu(e, node)}
        {...drag.listeners}
        {...drag.attributes}
      >
        <span className="caret" />
        <span className="tree-icon">
          <FileText size={15} />
        </span>
        <span className="tree-name">{nodeLabel(node)}</span>
      </div>
    </li>
  )
}
