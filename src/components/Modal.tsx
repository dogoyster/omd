import { useEffect, useState } from 'react'

// window.prompt/confirm 대체 (Tauri WKWebView는 이들을 지원하지 않음).
export type ModalState =
  | { kind: 'input'; title: string; initial: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; resolve: (v: boolean) => void }

interface Props {
  state: ModalState
  onClose: () => void
}

export function Modal({ state, onClose }: Props) {
  const [value, setValue] = useState(state.kind === 'input' ? state.initial : '')

  function cancel() {
    if (state.kind === 'input') state.resolve(null)
    else state.resolve(false)
    onClose()
  }
  function confirm() {
    if (state.kind === 'input') state.resolve(value)
    else state.resolve(true)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="modal-overlay" onClick={cancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{state.title}</div>
        {state.kind === 'input' && (
          <input
            className="dialog-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirm()
              }
            }}
          />
        )}
        <div className="dialog-actions">
          <button className="dialog-btn" onClick={cancel}>
            취소
          </button>
          <button className="dialog-btn primary" onClick={confirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
