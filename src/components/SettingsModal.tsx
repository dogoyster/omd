import { useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

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
  mirrorEnabled: boolean
  mirrorTarget: string
  mirrorLast: number
  onThemeChange: (t: Theme) => void
  onDefaultDirChange: (d: string) => void
  onMirrorToggle: (v: boolean) => void
  onPickMirrorTarget: () => void
  onSyncNow: () => void
  onClose: () => void
}

export function SettingsModal({
  theme,
  defaultDir,
  dirOptions,
  area,
  mirrorEnabled,
  mirrorTarget,
  mirrorLast,
  onThemeChange,
  onDefaultDirChange,
  onMirrorToggle,
  onPickMirrorTarget,
  onSyncNow,
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
          <div className="select-wrap">
            <select
              className="settings-select"
              value={defaultDir}
              onChange={(e) => onDefaultDirChange(e.target.value)}
            >
              {/* 빈 값(="")이 곧 Inbox라서 목록의 "Inbox"는 중복 — 제외한다 */}
              <option value="">Inbox (기본)</option>
              {dirOptions
                .filter((d) => d !== 'Inbox')
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>
            <ChevronDown className="select-caret" size={15} aria-hidden="true" />
          </div>
        </section>

        <section className="settings-row">
          <label>
            백업<span className="settings-hint"> · 로컬 vault → Drive 폴더 미러링</span>
          </label>
          <label className="mirror-toggle">
            <input
              type="checkbox"
              checked={mirrorEnabled}
              onChange={(e) => onMirrorToggle(e.target.checked)}
            />
            자동 백업 (다른 앱으로 전환 시 · 3분마다)
          </label>
          <div className="mirror-row">
            <span className="mirror-path" title={mirrorTarget}>
              {mirrorTarget || '백업 폴더 미선택'}
            </span>
            <button className="dialog-btn" onClick={onPickMirrorTarget}>
              폴더 선택
            </button>
          </div>
          <div className="mirror-row">
            <span className="settings-hint">
              마지막 백업: {mirrorLast ? new Date(mirrorLast).toLocaleString() : '없음'}
            </span>
            <button className="dialog-btn" onClick={onSyncNow} disabled={!mirrorTarget}>
              지금 백업
            </button>
          </div>
          <p className="settings-hint">
            vault는 <b>로컬 폴더</b>에 두고 여기에 Drive 폴더를 지정하세요. 편집은 로컬에서만 일어나
            동기화 충돌이 없습니다.
          </p>
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
