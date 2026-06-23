import type { Frontmatter } from '../types'

export interface ParsedDoc {
  data: Frontmatter
  body: string
}

const FM_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * files.md 컨벤션의 최소 frontmatter만 다루는 경량 파서.
 * 본격 YAML이 아니라 `key: value`와 인라인 배열 `[a, b]`만 지원한다.
 */
export function parseDoc(text: string): ParsedDoc {
  const m = FM_BLOCK.exec(text)
  if (!m) return { data: {}, body: text }
  return { data: parseYamlish(m[1]), body: text.slice(m[0].length) }
}

export interface SplitDoc {
  /** "---\n...\n---\n" 원본 블록 그대로. 없으면 빈 문자열. */
  frontmatter: string
  body: string
}

/**
 * frontmatter 블록을 파싱하지 않고 원문 그대로 떼어낸다.
 * WYSIWYG 편집기가 frontmatter를 수평선으로 오해해 날리는 것을 막기 위함.
 */
export function splitFrontmatter(text: string): SplitDoc {
  const m = FM_BLOCK.exec(text)
  if (!m) return { frontmatter: '', body: text }
  return { frontmatter: m[0], body: text.slice(m[0].length) }
}

function parseYamlish(block: string): Frontmatter {
  const out: Frontmatter = {}
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    const raw = m[2].trim()
    if (raw === '') {
      out[key] = ''
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      out[key] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter((s) => s.length > 0)
    } else {
      out[key] = unquote(raw)
    }
  }
  return out
}

function unquote(s: string): string {
  return s.replace(/^["']|["']$/g, '')
}

/** 카드 제목: 본문 첫 H1 헤딩 → 없으면 파일명(.md 제거). */
export function deriveTitle(body: string, filename: string): string {
  const h = /^#\s+(.+)$/m.exec(body)
  if (h) return h[1].trim()
  return filename.replace(/\.md$/i, '')
}
