import type { MouseEvent } from 'react'
import { FileText, Folder, PanelLeft, PanelLeftClose, Plus, X } from 'lucide-react'

export interface TabItem {
  id: number
  title: string
  kind: 'file' | 'dir'
  active: boolean
}

interface Props {
  tabs: TabItem[]
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onActivate: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
}

export function TabBar({ tabs, sidebarOpen, onToggleSidebar, onActivate, onClose, onNew }: Props) {
  function close(e: MouseEvent, id: number) {
    e.stopPropagation() // 탭 활성화로 번지지 않게
    onClose(id)
  }
  return (
    <div className="tabbar">
      <button
        className="tab-toggle"
        onClick={onToggleSidebar}
        title={sidebarOpen ? '사이드바 닫기 (⌘B)' : '사이드바 열기 (⌘B)'}
        aria-label="사이드바 토글"
      >
        {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
      </button>
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={'tab' + (t.active ? ' active' : '')}
            onClick={() => onActivate(t.id)}
            title={t.title}
          >
            <span className="tab-icon">
              {t.kind === 'file' ? <FileText size={13} /> : <Folder size={13} />}
            </span>
            <span className="tab-title">{t.title}</span>
            {tabs.length > 1 && (
              <button className="tab-close" onClick={(e) => close(e, t.id)} aria-label="탭 닫기">
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="tab-new" onClick={onNew} title="새 탭" aria-label="새 탭">
        <Plus size={16} />
      </button>
    </div>
  )
}
