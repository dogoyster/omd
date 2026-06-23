export type Area = 'Work' | 'Personal'

export type Priority = 'high' | 'mid' | 'low'

export interface Frontmatter {
  project?: string
  priority?: Priority
  created?: string
  due?: string
  tags?: string[]
  source?: string
  [key: string]: unknown
}

export interface TreeNode {
  name: string
  kind: 'file' | 'directory'
  /** vault 루트 기준 상대 경로, 예: "Work/Projects/1-Todo/foo.md" */
  path: string
  children?: TreeNode[]
}

export interface KanbanCard {
  name: string
  title: string
  path: string
  meta: Frontmatter
}

export interface KanbanColumn {
  /** 폴더명 그대로, 예: "1-Todo" */
  name: string
  /** 표시용 라벨, 예: "Todo" */
  label: string
  /** vault 루트 기준 상대 경로, 예: "Work/Projects/1-Todo" */
  path: string
  cards: KanbanCard[]
}

/** 에디터가 여는 문서 */
export interface OpenDoc {
  path: string
}

/** 검색 인덱스 항목 (영역 전체 .md) */
export interface SearchEntry {
  path: string
  name: string
  title: string
  /** 검색용 소문자 문자열 (제목 + 본문) */
  haystack: string
  /** 스니펫 표시용 원본 본문 */
  body: string
}
