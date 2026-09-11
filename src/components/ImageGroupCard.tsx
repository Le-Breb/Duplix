import { useMemo, useState } from 'react'
import type { SimilarImageGroup } from '../lib/api'
import { commonDirPrefix, fileName, formatBytes, formatDate, relativePath } from '../lib/format'
import { defaultKeepIndex, type GroupUiState } from '../lib/groups'
import { ImageThumb } from './ImageThumb'
import { ImageCompareModal } from './ImageCompareModal'

interface ImageGroupCardProps {
  group: SimilarImageGroup
  ui: GroupUiState
  onToggleOpen: () => void
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

export function ImageGroupCard({ group, ui, onToggleOpen, onToggleSkip, onSetKeepIndex }: ImageGroupCardProps) {
  const [comparing, setComparing] = useState(false)
  const keepIndex = ui.keepIndex ?? defaultKeepIndex(group.files)
  const keptFile = group.files[keepIndex]
  const reclaim = ui.skipped
    ? 0
    : group.files.reduce((sum, f, i) => (i === keepIndex ? sum : sum + f.size), 0)
  const commonDir = useMemo(() => commonDirPrefix(group.files.map((f) => f.path)), [group.files])

  const keepNewest = () => {
    let best = 0
    group.files.forEach((f, i) => {
      if (f.mtime > group.files[best].mtime) best = i
    })
    onSetKeepIndex(best)
  }

  return (
    <div
      className="mt-2.5 overflow-hidden rounded-[9px]"
      style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}
    >
      <button
        onClick={onToggleOpen}
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
        <div className="w-[18px] text-center text-[11px]" style={{ color: 'var(--ink4)' }}>
          {ui.open ? '▲' : '▼'}
        </div>
      </button>

      {ui.open && (
        <div style={{ borderTop: '1px solid var(--line3)', background: 'var(--bg3)' }}>
          <div className="flex items-center gap-3.5 py-2.5 pl-[74px] pr-3.5 text-xs" style={{ color: 'var(--ink3)' }}>
            <div className="flex-1">Pick the photo to keep</div>
            <button
              onClick={() => setComparing(true)}
              className="rounded-md px-2 py-[3px] text-xs"
              style={{ color: 'var(--accent)' }}
            >
              Compare full size
            </button>
            <button
              onClick={keepNewest}
              className="rounded-md px-2 py-[3px] text-xs"
              style={{ color: 'var(--accent)' }}
            >
              Keep newest
            </button>
            <button
              onClick={() => onSetKeepIndex(null)}
              className="rounded-md px-2 py-[3px] text-xs"
              style={{ color: 'var(--accent)' }}
            >
              Keep shortest path
            </button>
            <button
              onClick={onToggleSkip}
              className="rounded-md px-2 py-[3px] text-xs"
              style={{ color: 'var(--ink3)' }}
            >
              {ui.skipped ? 'Include this set' : 'Keep all in this set'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-3 md:grid-cols-4">
            {group.files.map((f, i) => {
              const isKeep = i === keepIndex && !ui.skipped
              return (
                <button
                  key={f.path}
                  onClick={() => !ui.skipped && onSetKeepIndex(i)}
                  disabled={ui.skipped}
                  className="flex flex-col overflow-hidden rounded-md text-left disabled:cursor-default"
                  style={{
                    border: isKeep || ui.skipped ? '1.5px solid var(--tint-line)' : '1px solid var(--line)',
                    background: 'var(--panel)',
                  }}
                >
                  <div className="relative aspect-square w-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <ImageThumb path={f.path} />
                    <div
                      className="absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.05em]"
                      style={
                        ui.skipped || isKeep
                          ? { background: 'var(--tint)', color: 'var(--accent)', border: '1px solid var(--tint-line)' }
                          : { background: 'var(--warn-bg)', color: 'var(--warn-ink)', border: '1px solid var(--warn-line)' }
                      }
                    >
                      {ui.skipped || isKeep ? 'KEEP' : '→ TRASH'}
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="truncate font-mono text-[10.5px]" style={{ color: 'var(--ink)' }}>
                      {fileName(f.path)}
                    </div>
                    <div className="mt-0.5 truncate text-[10.5px]" style={{ color: 'var(--ink3)' }}>
                      {formatDate(f.mtime)} · {formatBytes(f.size)}
                    </div>
                    <div
                      className="mt-0.5 truncate font-mono text-[10px]"
                      style={{ color: 'var(--ink4)' }}
                      title={relativePath(f.path, commonDir)}
                    >
                      {relativePath(f.path, commonDir)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {comparing && (
        <ImageCompareModal
          group={group}
          ui={ui}
          commonDir={commonDir}
          onSetKeepIndex={onSetKeepIndex}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  )
}
