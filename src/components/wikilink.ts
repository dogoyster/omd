import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'

/** 완성된 위키링크 `[[대상]]` 또는 `[[대상|별칭]]` — 스타일·클릭 대상. */
const LINK_RE = /\[\[([^[\]\n]+)\]\]/g
/** 입력 중인 미완성 링크: 커서 앞이 `[[질의`(닫는 `]` 없음) 인지. */
const OPEN_RE = /\[\[([^[\]\n|]*)$/

export interface WikilinkOpts {
  /** 자동완성 후보(노트 제목·경로). 최신 상태를 반환하도록 ref 기반으로 넘긴다. */
  getNotes: () => { title: string; path: string }[]
  /** 위키링크 클릭 시 대상(제목)으로 이동. */
  onOpen: (target: string) => void
}

/** `[[ ]]` 위키링크: 인라인 스타일 + 클릭 이동 + 타이핑 자동완성 팝업. */
export function wikilinkPlugin(opts: WikilinkOpts) {
  const key = new PluginKey('omd-wikilink')
  return $prose(() => {
    let popup: HTMLDivElement | null = null
    let items: { title: string; path: string }[] = []
    let index = 0
    // 입력 중인 `[[질의` 범위(첫 `[` 위치 ~ 커서). null이면 자동완성 비활성.
    let range: { from: number; to: number } | null = null

    function close() {
      popup?.remove()
      popup = null
      range = null
      items = []
      index = 0
    }

    function accept(view: EditorView): boolean {
      if (!range || !items[index]) {
        close()
        return false
      }
      const insert = `[[${items[index].title}]]`
      const tr = view.state.tr.insertText(insert, range.from, range.to)
      const caret = range.from + insert.length
      tr.setSelection(TextSelection.create(tr.doc, caret))
      view.dispatch(tr)
      close()
      view.focus()
      return true
    }

    function render(view: EditorView) {
      if (!range) return
      try {
        if (!popup) {
          popup = document.createElement('div')
          popup.className = 'wikilink-popup'
          document.body.appendChild(popup)
        }
        popup.innerHTML = ''
        if (items.length === 0) {
          const empty = document.createElement('div')
          empty.className = 'wikilink-empty'
          empty.textContent = '일치하는 노트 없음'
          popup.appendChild(empty)
        } else {
          items.forEach((it, i) => {
            const el = document.createElement('div')
            el.className = 'wikilink-item' + (i === index ? ' on' : '')
            el.textContent = it.title
            // mousedown(포커스 잃기 전)에서 처리 — click이면 에디터 blur로 range가 닫힘
            el.addEventListener('mousedown', (e) => {
              e.preventDefault()
              index = i
              accept(view)
            })
            popup!.appendChild(el)
          })
        }
        const coords = view.coordsAtPos(range.to)
        popup.style.top = `${coords.bottom + 4}px`
        popup.style.left = `${coords.left}px`
      } catch {
        /* 좌표 계산 실패 등 — 팝업 무시(편집은 계속) */
      }
    }

    function update(view: EditorView) {
      try {
        const { selection } = view.state
        if (!selection.empty) {
          close()
          return
        }
        const $from = selection.$from
        const textBefore = view.state.doc.textBetween($from.start(), $from.pos, '\n', '\n')
        const m = OPEN_RE.exec(textBefore)
        if (!m) {
          close()
          return
        }
        const q = m[1].toLowerCase()
        const wasActive = range !== null
        range = { from: $from.pos - m[0].length, to: $from.pos }
        items = opts
          .getNotes()
          .filter((n) => n.title.toLowerCase().includes(q))
          .slice(0, 12)
        if (!wasActive || index >= items.length) index = 0
        render(view)
      } catch {
        close()
      }
    }

    return new Plugin({
      key,
      props: {
        // 완성된 [[...]]에 스타일(클릭 가능 표시)
        decorations(state) {
          const decos: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            for (const m of node.text.matchAll(LINK_RE)) {
              const start = pos + (m.index ?? 0)
              const target = m[1].split('|')[0].trim()
              // data 속성에 대상을 심어, 클릭 시 정확히 이 span만 판정한다
              decos.push(
                Decoration.inline(start, start + m[0].length, {
                  class: 'wikilink',
                  'data-wikilink': target,
                }),
              )
            }
          })
          return DecorationSet.create(state.doc, decos)
        },
        // 실제로 클릭한 DOM이 위키링크 span일 때만 이동 (줄 아무 곳이나 잡히던 버그 수정)
        handleClick(_view, _pos, event) {
          const el = (event.target as HTMLElement | null)?.closest?.('[data-wikilink]')
          const target = el?.getAttribute('data-wikilink')
          if (target) {
            opts.onOpen(target)
            return true
          }
          return false
        },
        handleKeyDown(view, event) {
          if (!range) return false
          const n = items.length
          if (event.key === 'ArrowDown' && n) {
            index = (index + 1) % n
            render(view)
            event.preventDefault()
            return true
          }
          if (event.key === 'ArrowUp' && n) {
            index = (index - 1 + n) % n
            render(view)
            event.preventDefault()
            return true
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            if (n) {
              event.preventDefault()
              return accept(view)
            }
            return false
          }
          if (event.key === 'Escape') {
            close()
            event.preventDefault()
            return true
          }
          return false
        },
      },
      view() {
        return {
          update: (view) => update(view),
          destroy: () => close(),
        }
      },
    })
  })
}
