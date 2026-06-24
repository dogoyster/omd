import { useCallback, useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { ArrowLeft, ArrowRight, Save, SlidersHorizontal } from 'lucide-react'
import type { OpenDoc } from '../types'
import { readFile, writeFile } from '../fs/vault'
import { extractTitle, formatFrontmatter, parseDoc, splitFrontmatter } from '../fs/frontmatter'
import { displayName } from '../names'
import { WysiwygEditor } from './WysiwygEditor'

type Mode = 'wysiwyg' | 'source'

// data-theme(수동 설정) 우선, 없으면 시스템(prefers-color-scheme)
function computeDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

interface Props {
  doc: OpenDoc
  onBack?: () => void
  onForward?: () => void
  /** 저장 직후 호출 — 저장된 경로와 내용을 넘겨, 부모가 파일명↔제목 동기화에 쓴다. */
  onSaved?: (path: string, text: string) => void
}

export function Editor({ doc, onBack, onForward, onSaved }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [dark, setDark] = useState(computeDark)
  // 외부(동기화 등)에서 파일이 바뀌었을 때 안내 배너
  const [extChanged, setExtChanged] = useState(false)
  // 디스크 버전 채택 시 WYSIWYG를 강제 재마운트하기 위한 키
  const [reloadKey, setReloadKey] = useState(0)
  // frontmatter(우선순위·마감·태그) 편집 패널 표시 여부
  const [propsOpen, setPropsOpen] = useState(false)

  // ---- refs (콜백/이펙트보다 먼저 선언) ----
  const textRef = useRef(text)
  const savedRef = useRef(saved)
  const onSavedRef = useRef(onSaved)
  // 이 세션에서 편집이 한 번이라도 있었는지 — 이탈 시 파일명 동기화 여부 판단.
  const editedRef = useRef(false)
  // 우리가 마지막으로 읽거나 쓴 디스크 내용(=알고 있는 디스크 상태). 외부 변경 판정 기준.
  const baselineRef = useRef('')
  // 외부 변경 감지 시점의 디스크 내용(배너 동작에 사용).
  const extDiskRef = useRef('')

  useEffect(() => {
    textRef.current = text
    savedRef.current = saved
    onSavedRef.current = onSaved
  })

  useEffect(() => {
    const update = () => setDark(computeDark())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    // 설정에서 data-theme를 바꾸면 에디터 테마도 따라가도록 관찰
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      obs.disconnect()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    readFile(doc.path).then((t) => {
      if (cancelled) return
      setText(t)
      setSaved(true)
      baselineRef.current = t
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [doc.path])

  // 내용만 디스크에 저장(파일명 동기화·리로드 없음). 자동저장·blur에서 사용.
  const persist = useCallback(async () => {
    const t = textRef.current
    try {
      await writeFile(doc.path, t)
      // 저장하는 사이 추가 편집이 없었으면 깨끗 표시 + baseline 갱신
      if (textRef.current === t) {
        setSaved(true)
        savedRef.current = true
        baselineRef.current = t
      }
    } catch {
      /* 삭제/권한 등 — best-effort */
    }
  }, [doc.path])

  // 명시적 저장(⌘S): 저장 + baseline 갱신 + 부모에 알림(파일명↔제목 동기화).
  const save = useCallback(async () => {
    const t = text
    await writeFile(doc.path, t)
    setSaved(true)
    savedRef.current = true
    baselineRef.current = t
    editedRef.current = false
    onSaved?.(doc.path, t)
  }, [doc.path, text, onSaved])

  // 디스크의 최신 내용을 채택(로컬 변경 폐기) + WYSIWYG 재마운트.
  const adoptDisk = useCallback(() => {
    const disk = extDiskRef.current
    setText(disk)
    setSaved(true)
    savedRef.current = true
    editedRef.current = false
    baselineRef.current = disk
    setExtChanged(false)
    setReloadKey((k) => k + 1)
  }, [])

  // 자동저장(디바운스): 마지막 편집 ~1.5초 후 내용만 저장. (클라우드 업로드·충돌 창 최소화)
  useEffect(() => {
    if (saved) return
    const id = window.setTimeout(() => void persist(), 1500)
    return () => window.clearTimeout(id)
  }, [text, saved, persist])

  // 창이 포커스를 잃을 때 즉시 내용 저장(디바운스 대기 없이) — 전환/닫힘 대비.
  useEffect(() => {
    const onBlur = () => {
      if (!savedRef.current) void persist()
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [persist])

  // 다른 문서로 전환(언마운트)될 때 편집이 있었으면 최종 저장 + 파일명 동기화 → 유실 방지.
  useEffect(() => {
    return () => {
      if (editedRef.current)
        void writeFile(doc.path, textRef.current)
          .then(() => onSavedRef.current?.(doc.path, textRef.current))
          .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 창 포커스 시 디스크를 baseline과 비교 — 우리가 모르는 외부 변경일 때만 배너.
  // (로컬 편집만 있는 경우엔 disk===baseline이라 오탐하지 않는다)
  useEffect(() => {
    const onFocus = () => {
      void readFile(doc.path)
        .then((disk) => {
          if (disk === baselineRef.current) return
          extDiskRef.current = disk
          setExtChanged(true)
        })
        .catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [doc.path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!saved) void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, saved])

  // WYSIWYG는 본문만 편집 → 저장 시 원본 frontmatter와 재결합
  const onWysiwygChange = useCallback((newBody: string) => {
    setText((prev) => splitFrontmatter(prev).frontmatter + newBody)
    setSaved(false)
    editedRef.current = true
  }, [])

  const onSourceChange = useCallback((v: string) => {
    setText(v)
    setSaved(false)
    editedRef.current = true
  }, [])

  // frontmatter 한 필드만 갱신 → 본문은 보존하고 블록만 재작성.
  function setField(key: string, value: string | string[]) {
    const data = { ...parseDoc(text).data, [key]: value }
    setText(formatFrontmatter(data) + splitFrontmatter(text).body)
    setSaved(false)
    editedRef.current = true
  }

  const body = splitFrontmatter(text).body
  const fm = parseDoc(text).data
  const filename = doc.path.split('/').pop() ?? doc.path
  // 제목: 본문 H1(편집 중에도 실시간 반영) → 없으면 파일명(.md 제거)
  const title = extractTitle(body) ?? displayName(filename)
  // 경로 prefix는 폴더만, 표시용 이름으로 (확장자·하이픈 없이)
  const crumb = doc.path.split('/').slice(0, -1).map(displayName).join(' / ')

  return (
    <div className="editor">
      <header className="editor-bar">
        {(onBack || onForward) && (
          <div className="nav-btns">
            <button className="back-btn" onClick={onBack} disabled={!onBack} title="뒤로 (⌘[)">
              <ArrowLeft size={18} />
            </button>
            <button
              className="back-btn"
              onClick={onForward}
              disabled={!onForward}
              title="앞으로 (⌘])"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        )}
        <div className="doc-heading">
          {crumb && <span className="doc-crumb">{crumb}</span>}
          <span className="doc-title">{title}</span>
        </div>
        <span className="spacer" />
        <button
          className={'icon-btn' + (propsOpen ? ' on' : '')}
          onClick={() => setPropsOpen((o) => !o)}
          title="속성 (우선순위·마감·태그)"
          aria-label="속성"
        >
          <SlidersHorizontal size={15} />
        </button>
        <div className="seg mode-seg">
          <button
            className={'seg-btn' + (mode === 'wysiwyg' ? ' on' : '')}
            onClick={() => setMode('wysiwyg')}
          >
            서식
          </button>
          <button
            className={'seg-btn' + (mode === 'source' ? ' on' : '')}
            onClick={() => setMode('source')}
          >
            소스
          </button>
        </div>
        <span
          className={'save-dot' + (saved ? '' : ' dirty')}
          title={saved ? '저장됨' : '변경됨 — 저장 안 됨'}
        />
        <button className="save-btn" onClick={() => void save()} disabled={saved}>
          <Save size={13} /> 저장 <kbd>⌘S</kbd>
        </button>
      </header>
      {propsOpen && (
        <div className="props-panel">
          <label>
            우선순위
            <select value={fm.priority ?? ''} onChange={(e) => setField('priority', e.target.value)}>
              <option value="">없음</option>
              <option value="high">high</option>
              <option value="mid">mid</option>
              <option value="low">low</option>
            </select>
          </label>
          <label>
            마감
            <input
              type="date"
              value={typeof fm.due === 'string' ? fm.due : ''}
              onChange={(e) => setField('due', e.target.value)}
            />
          </label>
          <label>
            태그
            <input
              type="text"
              placeholder="쉼표로 구분"
              value={Array.isArray(fm.tags) ? fm.tags.join(', ') : ''}
              onChange={(e) =>
                setField(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            프로젝트
            <input
              type="text"
              value={typeof fm.project === 'string' ? fm.project : ''}
              onChange={(e) => setField('project', e.target.value)}
            />
          </label>
        </div>
      )}
      {extChanged && (
        <div className="ext-banner">
          <span>이 파일이 다른 곳(동기화 등)에서 바뀌었어요.</span>
          <button onClick={adoptDisk}>디스크 버전 불러오기</button>
          <button
            className="ghost"
            onClick={() => {
              // 외부 버전을 인지(baseline 갱신)하되 내 화면은 유지 → 같은 변경으로 다시 묻지 않음
              baselineRef.current = extDiskRef.current
              setExtChanged(false)
            }}
          >
            무시
          </button>
        </div>
      )}
      <div className="editor-body">
        {loading ? (
          <div className="placeholder">불러오는 중…</div>
        ) : mode === 'wysiwyg' ? (
          <WysiwygEditor key={doc.path + ':' + reloadKey} initial={body} onChange={onWysiwygChange} />
        ) : (
          <CodeMirror
            value={text}
            theme={dark ? 'dark' : 'light'}
            height="100%"
            extensions={[markdown()]}
            basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
            onChange={onSourceChange}
          />
        )}
      </div>
    </div>
  )
}
