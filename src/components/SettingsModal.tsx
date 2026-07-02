import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type Theme = 'system' | 'light' | 'dark'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

type Tab = 'general' | 'note' | 'sync'
const TABS: { value: Tab; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'note', label: '노트' },
  { value: 'sync', label: '동기화' },
]

interface Props {
  theme: Theme
  defaultDir: string
  dirOptions: string[]
  area: string
  newNoteName: string
  mirrorEnabled: boolean
  mirrorTarget: string
  mirrorLast: number
  gitEnabled: boolean
  gitLast: number
  gitInterval: number
  onThemeChange: (t: Theme) => void
  onDefaultDirChange: (d: string) => void
  onNewNoteNameChange: (v: string) => void
  onMirrorToggle: (v: boolean) => void
  onPickMirrorTarget: () => void
  onSyncNow: () => void
  onGitToggle: (v: boolean) => void
  onGitIntervalChange: (min: number) => void
  onGitSyncNow: () => void
  onClose: () => void
}

function fmt(ts: number): string {
  return ts ? new Date(ts).toLocaleString() : '없음'
}

export function SettingsModal({
  theme,
  defaultDir,
  dirOptions,
  area,
  newNoteName,
  mirrorEnabled,
  mirrorTarget,
  mirrorLast,
  gitEnabled,
  gitLast,
  gitInterval,
  onThemeChange,
  onDefaultDirChange,
  onNewNoteNameChange,
  onMirrorToggle,
  onPickMirrorTarget,
  onSyncNow,
  onGitToggle,
  onGitIntervalChange,
  onGitSyncNow,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('general')

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

        <div className="seg settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.value}
              className={'seg-btn' + (tab === t.value ? ' on' : '')}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' && (
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
        )}

        {tab === 'note' && (
          <>
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
              <label>새 노트 기본 이름</label>
              <input
                className="settings-input"
                type="text"
                value={newNoteName}
                placeholder="비우면 '무제'. 예: {datetime}"
                onChange={(e) => onNewNoteNameChange(e.target.value)}
              />
              <p className="settings-hint">
                토큰: <code>{'{date}'}</code> <code>{'{time}'}</code> <code>{'{datetime}'}</code>{' '}
                <code>{'{YYYY}{MM}{DD}{HH}{mm}{ss}'}</code> — 생성 시 현재 시각으로 치환.
              </p>
            </section>
          </>
        )}

        {tab === 'sync' && (
          <>
            <section className="settings-row">
              <h3 className="settings-sub">Drive 폴더 미러링</h3>
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
                <span className="settings-hint">마지막 백업: {fmt(mirrorLast)}</span>
                <button className="dialog-btn" onClick={onSyncNow} disabled={!mirrorTarget}>
                  지금 백업
                </button>
              </div>
              <p className="settings-hint">
                vault는 <b>로컬 폴더</b>에 두고 여기에 Drive 폴더(전용/빈 폴더)를 지정하세요. 편집은
                로컬에서만 일어나 동기화 충돌이 없습니다.
              </p>
            </section>

            <section className="settings-row">
              <h3 className="settings-sub">Git (GitHub)</h3>
              <label className="mirror-toggle">
                <input
                  type="checkbox"
                  checked={gitEnabled}
                  onChange={(e) => onGitToggle(e.target.checked)}
                />
                Git 자동 동기화 (실행 시 · 주기적으로 커밋+푸시)
              </label>
              <div className="mirror-row">
                <span className="settings-hint">자동 동기화 주기</span>
                <div className="select-wrap" style={{ width: 110 }}>
                  <select
                    className="settings-select"
                    value={gitInterval}
                    onChange={(e) => onGitIntervalChange(Number(e.target.value))}
                  >
                    <option value={5}>5분</option>
                    <option value={10}>10분</option>
                    <option value={30}>30분</option>
                    <option value={60}>60분</option>
                  </select>
                  <ChevronDown className="select-caret" size={15} aria-hidden="true" />
                </div>
              </div>
              <div className="mirror-row">
                <span className="settings-hint">마지막 동기화: {fmt(gitLast)}</span>
                <button className="dialog-btn" onClick={onGitSyncNow}>
                  지금 동기화
                </button>
              </div>
              <p className="settings-hint">
                vault 폴더가 <b>git 저장소</b>여야 합니다(먼저 <code>git init</code> + 원격 remote +
                인증 설정). <code>add → commit → pull --rebase → push</code>를 수행해요.
              </p>
            </section>
          </>
        )}

        <div className="dialog-actions">
          <button className="dialog-btn primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
