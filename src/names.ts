/** 끝의 .md(중복 포함) 제거. 예: "foo.md" → "foo", "foo.md.md" → "foo". */
export function stripMd(s: string): string {
  return s.replace(/(?:\.md)+$/i, '')
}

/** 표시용 이름: .md 확장자 제거 + 하이픈을 공백으로 (실제 파일명은 그대로 유지). */
export function displayName(name: string): string {
  return stripMd(name).replace(/-+/g, ' ')
}

/** 트리·리스트·탭에서 노드 라벨: H1 제목 우선(끝의 .md만 제거), 없으면 파일명. */
export function nodeLabel(node: { name: string; title?: string }): string {
  return node.title ? stripMd(node.title) : displayName(node.name)
}
