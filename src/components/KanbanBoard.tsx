import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import type { KanbanCard, KanbanColumn } from '../types'

interface Props {
  columns: KanbanColumn[]
  onMove: (cardPath: string, fromColName: string, toColName: string) => void
  onOpenCard: (card: KanbanCard) => void
  onNewCard: (col: KanbanColumn) => void
  onAddColumn: () => void
  onRenameColumn: (col: KanbanColumn) => void
  onDeleteColumn: (col: KanbanColumn) => void
}

export function KanbanBoard({
  columns,
  onMove,
  onOpenCard,
  onNewCard,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
}: Props) {
  // 5px 이상 움직여야 드래그 시작 → 단순 클릭(카드 열기)과 구분
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)

  function handleDragStart(e: DragStartEvent) {
    const path = String(e.active.id)
    for (const col of columns) {
      const found = col.cards.find((c) => c.path === path)
      if (found) {
        setActiveCard(found)
        return
      }
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = e
    if (!over) return
    const toColName = String(over.id)
    const fromColName = String(active.data.current?.colName ?? '')
    const cardPath = String(active.id)
    if (fromColName && toColName && fromColName !== toColName) {
      onMove(cardPath, fromColName, toColName)
    }
  }

  if (columns.length === 0) {
    return (
      <div className="placeholder">
        이 영역에 Projects/ 폴더가 없어요.
        <button className="add-column inline" onClick={onAddColumn}>
          + 컬럼 만들기
        </button>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveCard(null)}
    >
      <div className="board">
        {columns.map((col) => (
          <Column
            key={col.name}
            col={col}
            onOpenCard={onOpenCard}
            onNewCard={onNewCard}
            onRenameColumn={onRenameColumn}
            onDeleteColumn={onDeleteColumn}
          />
        ))}
        <button className="add-column" onClick={onAddColumn} title="새 컬럼">
          ＋ 컬럼
        </button>
      </div>
      {/* 드래그 중 카드는 최상위로 띄워 컬럼 overflow에 잘리지 않고 마우스를 따라온다 */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="card overlay">
            <CardBody card={activeCard} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

interface ColumnProps {
  col: KanbanColumn
  onOpenCard: (card: KanbanCard) => void
  onNewCard: (col: KanbanColumn) => void
  onRenameColumn: (col: KanbanColumn) => void
  onDeleteColumn: (col: KanbanColumn) => void
}

function Column({ col, onOpenCard, onNewCard, onRenameColumn, onDeleteColumn }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: col.name })
  return (
    <div ref={setNodeRef} className={'column' + (isOver ? ' over' : '')}>
      <div className="column-head">
        <span className="col-label">{col.label}</span>
        <span className="count">{col.cards.length}</span>
        <div className="row-actions col-actions">
          <button title="컬럼 이름변경" onClick={() => onRenameColumn(col)}>
            ✎
          </button>
          <button title="컬럼 삭제" onClick={() => onDeleteColumn(col)}>
            🗑
          </button>
        </div>
        <button className="add" title="새 카드" onClick={() => onNewCard(col)}>
          ＋
        </button>
      </div>
      <div className="column-body">
        {col.cards.length === 0 ? (
          <div className="column-empty">{isOver ? '여기에 놓기' : '비어 있음'}</div>
        ) : (
          col.cards.map((card) => (
            <Card key={card.path} card={card} colName={col.name} onOpen={onOpenCard} />
          ))
        )}
      </div>
    </div>
  )
}

function CardBody({ card }: { card: KanbanCard }) {
  return (
    <>
      <div className="card-title">{card.title}</div>
      <div className="card-meta">
        {card.meta.priority && <span className={'pri ' + card.meta.priority}>{card.meta.priority}</span>}
        {card.meta.due && <span className="due">~{card.meta.due}</span>}
        {card.meta.project && <span className="proj">{card.meta.project}</span>}
      </div>
    </>
  )
}

interface CardProps {
  card: KanbanCard
  colName: string
  onOpen: (card: KanbanCard) => void
}

function Card({ card, colName, onOpen }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.path,
    data: { colName },
  })

  return (
    <div
      ref={setNodeRef}
      className={'card' + (isDragging ? ' dragging-source' : '')}
      onClick={() => onOpen(card)}
      {...listeners}
      {...attributes}
    >
      <CardBody card={card} />
    </div>
  )
}
