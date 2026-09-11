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

// Images-tab-only UI state — deliberately separate from GroupUiState above.
// The Files tab always keeps exactly one copy (files in an exact-duplicate
// group are byte-identical, so there's rarely a reason to keep more than
// one); the Images tab's groups are only *visually* similar, so a user
// legitimately might want to keep an arbitrary subset — e.g. two out of
// five near-duplicate photos, not just one or "all of them."
export interface ImageGroupUiState {
  // null = "use the computed default" (exactly one photo, via
  // defaultKeepIndex) — not yet touched by the user. Once the user keeps or
  // trashes any individual photo, this becomes a concrete Set (which can be
  // empty, meaning "trash every photo in this group," or the full set,
  // meaning "keep every photo" — both are valid, explicit choices here,
  // not edge cases to special-case around).
  keptIndices: Set<number> | null
}

export function resolveKeptIndices(files: FileEntry[], ui: ImageGroupUiState | undefined): Set<number> {
  if (ui?.keptIndices) return ui.keptIndices
  return new Set([defaultKeepIndex(files)])
}
