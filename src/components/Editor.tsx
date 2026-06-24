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
  // 외부(동기화 등)에서 파일이 바뀌었는데 로컬 편집이 있을 때 경고
  const [extChanged, setExtChanged] = useState(false)
  // 디스크 버전 채택 시 WYSIWYG를 강제 재마운트하기 위한 키
  const [reloadKey, setReloadKey] = useState(0)
  // frontmatter(우선순위·마감·태그) 편집 패널 표시 여부
  const [propsOpen, setPropsOpen] = useState(false)

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
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [doc.path])

  // 디스크의 최신 내용을 채택(로컬 변경 폐기) + WYSIWYG 재마운트.
  const adoptDisk = useCallback(async () => {
    const disk = await readFile(doc.path)
    setText(disk)
    setSaved(true)
    savedRef.current = true
    editedRef.current = false
    setExtChanged(false)
    setReloadKey((k) => k + 1)
  }, [doc.path])

  // 창 포커스 시 디스크와 비교 — 편집 없으면 조용히 갱신, 편집 중이면 경고 배너.
  useEffect(() => {
    const onFocus = () => {
      void readFile(doc.path)
        .then((disk) => {
          if (disk === textRef.current) return
          if (savedRef.current) {
            setText(disk)
            setSaved(true)
            editedRef.current = false
            setReloadKey((k) => k + 1)
          } else {
            setExtChanged(true)
          }
        })
        .catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [doc.path])

  const save = useCallback(async () => {
    await writeFile(doc.path, text)
    setSaved(true)
    // 동기적으로도 표시 — 파일명 동기화로 재마운트될 때 언마운트 autosave가
    // 옛 경로에 다시 쓰는(이름 되살아나는) 사고 방지
    savedRef.current = true
    editedRef.current = false // 명시적 저장으로 동기화 완료
    onSaved?.(doc.path, text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.path, text, onSaved])

  // 최신 text/saved/onSaved를 ref로 추적 — 언마운트 시점에 최신값을 읽기 위함
  const textRef = useRef(text)
  const savedRef = useRef(saved)
  const onSavedRef = useRef(onSaved)
  // 이 세션에서 편집이 한 번이라도 있었는지 — 이탈 시 파일명 동기화 여부 판단(자동저장과 무관하게).
  const editedRef = useRef(false)
  useEffect(() => {
    textRef.current = text
    savedRef.current = saved
    onSavedRef.current = onSaved
  })

  // 다른 문서로 전환(언마운트)될 때 저장 안 된 변경이 있으면 자동 저장 → 유실 방지.
  // App에서 <Editor key={doc.path} />로 문서마다 재마운트하므로 cleanup의 doc은 떠나는 문서다.
  useEffect(() => {
    return () => {
      // 편집이 있었다면 떠나는 시점에 최종 저장 + 파일명 동기화(자동저장이 내용만 보존했을 수 있음).
      // 삭제된 파일이었으면 실패할 수 있음 — best-effort라 조용히 무시
      if (editedRef.current)
        void writeFile(doc.path, textRef.current)
          .then(() => onSavedRef.current?.(doc.path, textRef.current))
          .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 주기적 자동저장 — 내용만 디스크에 보존(크래시 대비). 파일명 동기화·리로드는 ⌘S/이탈 때만.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (savedRef.current) return
      const t = textRef.current
      void writeFile(doc.path, t)
        .then(() => {
          if (textRef.current === t) {
            // 저장 사이 추가 편집이 없었으면 깨끗 표시
            setSaved(true)
            savedRef.current = true
          }
        })
        .catch(() => {})
    }, 2500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <button onClick={() => void adoptDisk()}>디스크 버전 불러오기</button>
          <button className="ghost" onClick={() => setExtChanged(false)}>
            내 편집 유지
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
