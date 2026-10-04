import type { DuplicateGroup, FileEntry, SimilarImageGroup } from './api'

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
  // defaultKeepIndex — or every photo for a group already reviewed, so a
  // global "Move to trash" never undoes a past "keep these") — not yet
  // touched by the user. Once the user keeps or
  // trashes any individual photo, this becomes a concrete Set (which can be
  // empty, meaning "trash every photo in this group," or the full set,
  // meaning "keep every photo" — both are valid, explicit choices here,
  // not edge cases to special-case around).
  keptIndices: Set<number> | null
}

export function resolveKeptIndices(group: SimilarImageGroup, ui: ImageGroupUiState | undefined): Set<number> {
  if (ui?.keptIndices) return ui.keptIndices
  if (group.reviewed) return new Set(group.files.keys())
  return new Set([defaultKeepIndex(group.files)])
}

// Same order as get_similar_image_groups in commands.rs — used to re-sort
// locally after marking/unmarking a group, instead of a full reload.
export function sortImageGroups(groups: SimilarImageGroup[]): SimilarImageGroup[] {
  return [...groups].sort(
    (a, b) =>
      Number(a.reviewed) - Number(b.reviewed) ||
      b.files.length - a.files.length ||
      a.max_distance - b.max_distance ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
