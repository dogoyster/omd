import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import './milkdown-theme.css'
import { wikilinkPlugin } from './wikilink'

interface Props {
  /** 마운트 시점의 본문(frontmatter 제외). 문서 전환은 부모의 key로 재마운트해 반영. */
  initial: string
  onChange: (markdown: string) => void
  /** 위키링크 자동완성 후보(노트 제목·경로). */
  notes: { title: string; path: string }[]
  /** `[[...]]` 클릭 시 대상 제목으로 이동. */
  onWikilink: (target: string) => void
}

export function WysiwygEditor({ initial, onChange, notes, onWikilink }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // 위키링크 플러그인이 항상 최신 노트 목록·핸들러를 읽도록 ref 경유
  const notesRef = useRef(notes)
  notesRef.current = notes
  const onWikilinkRef = useRef(onWikilink)
  onWikilinkRef.current = onWikilink

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let ready = false
    let destroyed = false
    let instance: Crepe | null = null

    const crepe = new Crepe({ root: host, defaultValue: initial })
    crepe.editor.use(
      wikilinkPlugin({
        getNotes: () => notesRef.current,
        onOpen: (target) => onWikilinkRef.current(target),
      }),
    )
    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        // create() 중 발생하는 초기 콜백은 무시 — 실제 사용자 편집만 dirty 처리
        if (ready) onChangeRef.current(markdown)
      })
    })
    crepe.create().then(() => {
      if (destroyed) {
        void crepe.destroy()
        return
      }
      instance = crepe
      ready = true
    })

    return () => {
      destroyed = true
      ready = false
      if (instance) void instance.destroy()
    }
    // initial/onChange는 의도적으로 deps에서 제외 (마운트 시 1회만 셋업, 갱신은 ref/key로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="milkdown-host" ref={hostRef} />
}
