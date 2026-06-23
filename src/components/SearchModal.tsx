import { useEffect, useMemo, useState } from 'react'
import type { SearchEntry } from '../types'

interface Props {
  entries: SearchEntry[]
  onClose: () => void
  onOpen: (entry: SearchEntry) => void
}

function makeSnippet(body: string, query: string): string {
  const lower = body.toLowerCase()
  const i = lower.indexOf(query)
  if (i < 0) return body.slice(0, 90).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, i - 30)
  const end = Math.min(body.length, i + query.length + 60)
  return (
    (start > 0 ? '…' : '') +
    body.slice(start, end).replace(/\s+/g, ' ').trim() +
    (end < body.length ? '…' : '')
  )
}

export function SearchModal({ entries, onClose, onOpen }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  const query = q.trim().toLowerCase()

  const results = useMemo(() => {
    if (!query) return []
    return entries
      .filter((e) => e.haystack.includes(query))
      .sort((a, b) => {
        // 제목 매치를 본문 매치보다 위로
        const am = a.title.toLowerCase().includes(query) ? 0 : 1
        const bm = b.title.toLowerCase().includes(query) ? 0 : 1
        return am - bm
      })
      .slice(0, 50)
  }, [query, entries])

  useEffect(() => {
    setSel(0)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => Math.min(s + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const r = results[sel]
        if (r) onOpen(r)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, sel, onClose, onOpen])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          className="search-input"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목·내용 검색…  (Esc 닫기)"
        />
        <ul className="search-results">
          {query && results.length === 0 && <li className="no-result">결과 없음</li>}
          {results.map((r, idx) => (
            <li
              key={r.path}
              className={'search-result' + (idx === sel ? ' on' : '')}
              onClick={() => onOpen(r)}
              onMouseEnter={() => setSel(idx)}
            >
              <div className="result-title">{r.title}</div>
              <div className="result-path">{r.path}</div>
              {query && <div className="result-snippet">{makeSnippet(r.body, query)}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
