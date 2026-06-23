// vault 루트 경로를 localStorage에 보관/복원.
// (Tauri는 경로 문자열만으로 파일 접근하므로 IndexedDB 핸들 영속화가 필요 없다.)

const KEY = 'omd.vaultPath'

export function saveVaultPath(path: string): void {
  localStorage.setItem(KEY, path)
}

export function loadVaultPath(): string | null {
  return localStorage.getItem(KEY)
}

export function clearVaultPath(): void {
  localStorage.removeItem(KEY)
}
