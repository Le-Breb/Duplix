import type { DuplicateGroup, FileEntry } from './api'

export interface GroupUiState {
  keepIndex: number | null
  skipped: boolean
  open: boolean
}

export function defaultKeepIndex(files: FileEntry[]): number {
  let best = 0
  for (let i = 1; i < files.length; i++) {
    const a = files[best]
    const b = files[i]
    if (b.path.length < a.path.length) {
      best = i
    } else if (b.path.length === a.path.length && b.mtime < a.mtime) {
      best = i
    }
  }
  return best
}

export function resolveKeepIndex(group: DuplicateGroup, ui: GroupUiState | undefined): number {
  if (ui?.keepIndex != null) return ui.keepIndex
  return defaultKeepIndex(group.files)
}

export function reclaimableBytes(group: DuplicateGroup): number {
  return group.size * (group.files.length - 1)
}
