import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import './milkdown-theme.css'

interface Props {
  /** 마운트 시점의 본문(frontmatter 제외). 문서 전환은 부모의 key로 재마운트해 반영. */
  initial: string
  onChange: (markdown: string) => void
}

export function WysiwygEditor({ initial, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let ready = false
    let destroyed = false
    let instance: Crepe | null = null

    const crepe = new Crepe({ root: host, defaultValue: initial })
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
