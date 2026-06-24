import { useEffect } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

interface Props {
  theme: Theme
  defaultDir: string
  dirOptions: string[]
  area: string
  onThemeChange: (t: Theme) => void
  onDefaultDirChange: (d: string) => void
  onClose: () => void
}

export function SettingsModal({
  theme,
  defaultDir,
  dirOptions,
  area,
  onThemeChange,
  onDefaultDirChange,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="settings-title">설정</h2>

        <section className="settings-row">
          <label>테마</label>
          <div className="seg theme-seg">
            {THEMES.map((t) => (
              <button
                key={t.value}
                className={'seg-btn' + (theme === t.value ? ' on' : '')}
                onClick={() => onThemeChange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-row">
          <label>
            새 노트 기본 폴더<span className="settings-hint"> · {area} 영역 기준</span>
          </label>
          <select
            className="settings-select"
            value={defaultDir}
            onChange={(e) => onDefaultDirChange(e.target.value)}
          >
            <option value="">Inbox (기본)</option>
            {dirOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </section>

        <div className="dialog-actions">
          <button className="dialog-btn primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
