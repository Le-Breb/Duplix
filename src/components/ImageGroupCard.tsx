import { useMemo, useState } from 'react'
import type { SimilarImageGroup } from '../lib/api'
import { commonDirPrefix, fileName, formatBytes } from '../lib/format'
import { defaultKeepIndex, type GroupUiState } from '../lib/groups'
import { ImageThumb } from './ImageThumb'
import { ImageCompareModal } from './ImageCompareModal'

interface ImageGroupCardProps {
  group: SimilarImageGroup
  ui: GroupUiState
  onToggleSkip: () => void
  onSetKeepIndex: (index: number | null) => void
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
export function ImageGroupCard({ group, ui, onToggleSkip, onSetKeepIndex }: ImageGroupCardProps) {
  const [comparing, setComparing] = useState(false)
  const keepIndex = ui.keepIndex ?? defaultKeepIndex(group.files)
  const keptFile = group.files[keepIndex]
  const reclaim = ui.skipped
    ? 0
    : group.files.reduce((sum, f, i) => (i === keepIndex ? sum : sum + f.size), 0)
  const commonDir = useMemo(() => commonDirPrefix(group.files.map((f) => f.path)), [group.files])

  return (
    <div
      className="mt-2.5 overflow-hidden rounded-[9px]"
      style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}
    >
      <button
        onClick={() => setComparing(true)}
        className="flex w-full items-center gap-3.5 p-3 px-3.5 text-left hover:brightness-[0.98]"
      >
        <div
          className="h-[46px] w-[46px] flex-none overflow-hidden rounded-[5px]"
          style={{ border: '1px solid var(--line)' }}
        >
          <ImageThumb key={keptFile.path} path={keptFile.path} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm" style={{ color: 'var(--ink)' }}>
            {fileName(keptFile.path)}
          </div>
          <div className="mt-1 truncate text-[12.5px]" style={{ color: 'var(--ink2)' }}>
            {group.files.length} similar photos · {similarityLabel(group.max_distance)}
          </div>
        </div>
        {ui.skipped ? (
          <div
            className="rounded-full px-[9px] py-1 font-mono text-[10px] tracking-[0.06em]"
            style={{ border: '1px solid var(--line)', color: 'var(--ink3)' }}
          >
            KEEPING ALL
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
        <div className="text-[11px]" style={{ color: 'var(--accent)' }}>
          Compare
        </div>
      </button>

      {comparing && (
        <ImageCompareModal
          group={group}
          ui={ui}
          commonDir={commonDir}
          onSetKeepIndex={onSetKeepIndex}
          onToggleSkip={onToggleSkip}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  )
}
