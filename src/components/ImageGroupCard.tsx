import { memo, useMemo, useState } from 'react'
import type { SimilarImageGroup } from '../lib/api'
import { commonDirPrefix, fileName, formatBytes } from '../lib/format'
import { resolveKeptIndices, type ImageGroupUiState } from '../lib/groups'
import { ImageThumb } from './ImageThumb'
import { ImageCompareModal } from './ImageCompareModal'

interface ImageGroupCardProps {
  group: SimilarImageGroup
  ui: ImageGroupUiState
  // Raw, id-aware handler rather than an already-bound-to-this-group
  // callback: ImagesScreen passes this straight through unwrapped, which is
  // what lets it stay referentially stable across its scroll-driven
  // re-renders (see the comment on React.memo below).
  onSetKeptIndices: (id: string, keptIndices: Set<number>) => void
  onCommitGroup: (group: SimilarImageGroup) => void
  committing: boolean
}

function similarityLabel(maxDistance: number): string {
  if (maxDistance === 0) return 'Identical'
  if (maxDistance <= 4) return 'Nearly identical'
  if (maxDistance <= 8) return 'Very similar'
  if (maxDistance <= 16) return 'Similar'
  return 'Loosely similar'
}

// A single group row opens the comparison view — there's no separate small
// "pick which to keep" grid anymore. It used to duplicate the same job at a
// worse (cropped, tiny) size; now there's exactly one place to look at a
// group's photos and decide which to keep.
//
// Wrapped in React.memo: ImagesScreen's group list is virtualized, and
// useVirtualizer re-renders it on every scroll frame — without memo, every
// visible row's ImageGroupCard (and its whole subtree, including
// ImageThumb) would fully re-render 60 times a second while scrolling, for
// no reason at all, since nothing about any individual group actually
// changes just because the user scrolled. This only pays off because
// ImagesScreen was also fixed to pass stable prop references (a shared
// EMPTY_UI object instead of a freshly-allocated one, and these unwrapped
// handlers instead of a new closure per row per render) — React.memo's
// shallow comparison is only as good as the stability of what it's
// comparing.
export const ImageGroupCard = memo(function ImageGroupCard({
  group,
  ui,
  onSetKeptIndices,
  onCommitGroup,
  committing,
}: ImageGroupCardProps) {
  const [comparing, setComparing] = useState(false)
  const kept = resolveKeptIndices(group.files, ui)
  const allKept = kept.size === group.files.length
  const noneKept = kept.size === 0
  const previewFile = group.files[noneKept ? 0 : [...kept][0]]
  const reclaim = group.files.reduce((sum, f, i) => (kept.has(i) ? sum : sum + f.size), 0)
  const commonDir = useMemo(() => commonDirPrefix(group.files.map((f) => f.path)), [group.files])

  return (
    <div
      className="mt-2.5 overflow-hidden rounded-[9px]"
      style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}
    >
      <button
        onClick={() => setComparing(true)}
        disabled={committing}
        className="flex w-full items-center gap-3.5 p-3 px-3.5 text-left hover:brightness-[0.98] disabled:cursor-default disabled:opacity-70"
      >
        <div
          className="h-[46px] w-[46px] flex-none overflow-hidden rounded-[5px]"
          style={{ border: '1px solid var(--line)' }}
        >
          <ImageThumb key={previewFile.path} path={previewFile.path} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm" style={{ color: 'var(--ink)' }}>
            {fileName(previewFile.path)}
          </div>
          <div className="mt-1 truncate text-[12.5px]" style={{ color: 'var(--ink2)' }}>
            {group.files.length} similar photos · {similarityLabel(group.max_distance)}
            {kept.size > 1 && !allKept && ` · ${kept.size} to keep`}
          </div>
        </div>
        {allKept ? (
          <div
            className="rounded-full px-[9px] py-1 font-mono text-[10px] tracking-[0.06em]"
            style={{ border: '1px solid var(--line)', color: 'var(--ink3)' }}
          >
            KEEPING ALL
          </div>
        ) : noneKept ? (
          <div
            className="rounded-full px-[9px] py-1 font-mono text-[10px] tracking-[0.06em]"
            style={{ border: '1px solid var(--warn-line)', background: 'var(--warn-bg)', color: 'var(--warn-ink)' }}
          >
            TRASHING ALL
          </div>
        ) : (
          <div className="text-right">
            <div className="font-mono text-sm" style={{ color: 'var(--ink)' }}>
              {formatBytes(reclaim)}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink3)' }}>
              to reclaim
            </div>
          </div>
        )}
        <div className="text-[11px]" style={{ color: committing ? 'var(--ink3)' : 'var(--accent)' }}>
          {committing ? 'Trashing…' : 'Compare'}
        </div>
      </button>

      {comparing && (
        <ImageCompareModal
          group={group}
          ui={ui}
          commonDir={commonDir}
          onSetKeptIndices={(indices) => onSetKeptIndices(group.id, indices)}
          onCommitNow={() => onCommitGroup(group)}
          committing={committing}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  )
})
