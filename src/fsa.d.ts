// File System Access API의 비표준/누락 멤버 타입 보강.
// import/export 없이 ambient 선언이라 전역 인터페이스와 declaration merging 된다.

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemFileHandle {
  // Chrome 비표준: 이동 move(parent, name) 또는 같은 폴더 내 이름변경 move(name).
  move?(nameOrParent: string | FileSystemDirectoryHandle, name?: string): Promise<void>
}

interface FileSystemDirectoryHandle {
  // Chrome 비표준: 같은 부모 안에서 디렉토리 이름변경(지원 여부 불확실 → 폴백 필요).
  move?(name: string): Promise<void>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | string
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}
