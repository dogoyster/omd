import { useCallback, useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import type { OpenDoc } from '../types'
import { readFile, writeFile } from '../fs/vault'
import { splitFrontmatter } from '../fs/frontmatter'
import { WysiwygEditor } from './WysiwygEditor'

type Mode = 'wysiwyg' | 'source'

interface Props {
  doc: OpenDoc
}

export function Editor({ doc }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
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

  const save = useCallback(async () => {
    await writeFile(doc.path, text)
    setSaved(true)
  }, [doc.path, text])

  // 최신 text/saved를 ref로 추적 — 언마운트 시점에 최신값을 읽기 위함
  const textRef = useRef(text)
  const savedRef = useRef(saved)
  useEffect(() => {
    textRef.current = text
    savedRef.current = saved
  })

  // 다른 문서로 전환(언마운트)될 때 저장 안 된 변경이 있으면 자동 저장 → 유실 방지.
  // App에서 <Editor key={doc.path} />로 문서마다 재마운트하므로 cleanup의 doc은 떠나는 문서다.
  useEffect(() => {
    return () => {
      // 삭제된 파일이었으면 실패할 수 있음 — best-effort라 조용히 무시
      if (!savedRef.current) void writeFile(doc.path, textRef.current).catch(() => {})
    }
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
  }, [])

  const onSourceChange = useCallback((v: string) => {
    setText(v)
    setSaved(false)
  }, [])

  return (
    <div className="editor">
      <header className="editor-bar">
        <span className="editor-path">{doc.path}</span>
        <span className="spacer" />
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
          저장 <kbd>⌘S</kbd>
        </button>
      </header>
      <div className="editor-body">
        {loading ? (
          <div className="placeholder">불러오는 중…</div>
        ) : mode === 'wysiwyg' ? (
          <WysiwygEditor key={doc.path} initial={splitFrontmatter(text).body} onChange={onWysiwygChange} />
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
