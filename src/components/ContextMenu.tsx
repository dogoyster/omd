import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface CtxItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface Props {
  x: number
  y: number
  items: CtxItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 메뉴 크기를 측정해 뷰포트를 벗어나면 위/왼쪽으로 펼친다 (paint 전에 보정 → 깜빡임 없음).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const M = 4
    let left = x
    let top = y
    if (x + r.width > vw) left = Math.max(M, x - r.width) // 오른쪽 넘치면 왼쪽으로
    if (y + r.height > vh) top = y - r.height // 아래 넘치면 위로 펼침
    if (top < M) top = Math.max(M, vh - r.height - M) // 위도 부족하면 화면 안으로 클램프
    if (left < M) left = M
    setPos({ left, top })
  }, [x, y, items.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="ctx-overlay"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => (
          <button
            key={i}
            className={'ctx-item' + (it.danger ? ' danger' : '')}
            onClick={() => {
              it.onClick()
              onClose()
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
