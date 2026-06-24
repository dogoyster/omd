/** 표시용 이름: .md 확장자 제거 + 하이픈을 공백으로 (실제 파일명은 그대로 유지). */
export function displayName(name: string): string {
  return name.replace(/\.md$/i, '').replace(/-+/g, ' ')
}
