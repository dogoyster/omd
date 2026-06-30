import { useEffect, useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import './milkdown-theme.css'
import { wikilinkPlugin } from './wikilink'
import { titlePlugin } from './titleField'

// 하이라이팅 없는 '플레인 텍스트' 언어 — 코드블록 언어 피커에 "Text" 옵션을 추가한다
// (기본 목록엔 html/java/c++ 등만 있고 text가 없어서 직접 넣는다).
const PLAIN_TEXT_LANG = LanguageDescription.of({
  name: 'Text',
  alias: ['text', 'plain', 'plaintext'],
  load: async () =>
    new LanguageSupport(
      StreamLanguage.define({
        token(stream) {
          stream.next()
          return null
        },
      }),
    ),
})

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

    const crepe = new Crepe({
      root: host,
      defaultValue: initial,
      featureConfigs: {
        [CrepeFeature.CodeMirror]: { languages: [PLAIN_TEXT_LANG, ...languages] },
      },
    })
    crepe.editor.use(
      wikilinkPlugin({
        getNotes: () => notesRef.current,
        onOpen: (target) => onWikilinkRef.current(target),
      }),
    )
    crepe.editor.use(titlePlugin())
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
