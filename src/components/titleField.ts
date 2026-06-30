import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'

/** 첫 블록이 제목(레벨1 헤딩)인지. */
function isTitle(node: ProseNode | null | undefined): boolean {
  return !!node && node.type.name === 'heading' && node.attrs.level === 1
}

/**
 * 본문 첫 H1을 "제목"으로 취급:
 * - 잠금: 원래 H1로 시작하는 문서는 첫 블록이 계속 H1이어야 한다(강등·위에 블록 추가 차단).
 * - placeholder: 제목이 비어 있으면 흐린 안내문(기본 '무제').
 * - 포커스: 빈 제목으로 시작하면(새 노트) 마운트 후 제목에 커서.
 */
export function titlePlugin(placeholder = '무제') {
  const key = new PluginKey('omd-title')
  return $prose(
    () =>
      new Plugin({
        key,
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true
          if (!isTitle(state.doc.firstChild)) return true // 원래 H1로 시작 안 하면 간섭하지 않음
          return isTitle(tr.doc.firstChild)
        },
        props: {
          decorations(state) {
            const first = state.doc.firstChild
            if (isTitle(first) && first && first.content.size === 0) {
              return DecorationSet.create(state.doc, [
                Decoration.node(0, first.nodeSize, {
                  class: 'omd-title-empty',
                  'data-placeholder': placeholder,
                }),
              ])
            }
            return DecorationSet.empty
          },
          handleKeyDown(view, event) {
            if (event.key !== 'Enter') return false
            const sel = view.state.selection
            const first = view.state.doc.firstChild
            // 제목 맨 앞에서 Enter → 위에 줄 생기는 것 방지
            if (sel.empty && isTitle(first) && sel.$head.parent === first && sel.$head.parentOffset === 0) {
              event.preventDefault()
              return true
            }
            return false
          },
        },
        view(editorView) {
          let killed = false
          const first = editorView.state.doc.firstChild
          if (isTitle(first) && first && first.content.size === 0) {
            // 마운트 직후 제목에 포커스 (다음 마이크로태스크에서 — 파괴됐으면 무시)
            Promise.resolve().then(() => {
              if (killed) return
              try {
                editorView.focus()
                editorView.dispatch(
                  editorView.state.tr.setSelection(TextSelection.create(editorView.state.doc, 1)),
                )
              } catch {
                /* 이미 파괴됨 등 — 무시 */
              }
            })
          }
          return {
            destroy() {
              killed = true
            },
          }
        },
      }),
  )
}
