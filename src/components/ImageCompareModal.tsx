import { useEffect, useState } from 'react'
import type { SimilarImageGroup } from '../lib/api'
import { fileName, formatBytes, formatDate, relativePath } from '../lib/format'
import { defaultKeepIndex, type GroupUiState } from '../lib/groups'
import { ImageThumb } from './ImageThumb'

interface ImageCompareModalProps {
  group: SimilarImageGroup
  ui: GroupUiState
  commonDir: string
  onSetKeepIndex: (index: number | null) => void
  onClose: () => void
}

/** Column count that keeps tiles as large as possible for a given photo
 * count: two photos get two big side-by-side panes (the common case), and
 * larger groups fall back to a denser grid rather than tiles too small to
 * compare anything in. */
function columnsFor(n: number): number {
  if (n <= 2) return n
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

export function ImageCompareModal({ group, ui, commonDir, onSetKeepIndex, onClose }: ImageCompareModalProps) {
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null)
  const keepIndex = ui.keepIndex ?? defaultKeepIndex(group.files)
  const n = group.files.length

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (zoomedIndex !== null) setZoomedIndex(null)
        else onClose()
      } else if (zoomedIndex !== null && e.key === 'ArrowRight') {
        setZoomedIndex((i) => (i === null ? i : (i + 1) % n))
      } else if (zoomedIndex !== null && e.key === 'ArrowLeft') {
        setZoomedIndex((i) => (i === null ? i : (i - 1 + n) % n))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomedIndex, n, onClose])

  const columns = columnsFor(n)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0a0c0f' }}>
      <div className="flex flex-none items-center justify-between px-5 py-3.5">
        <div className="text-[13.5px]" style={{ color: 'var(--panel)' }}>
          {zoomedIndex === null ? (
            `Comparing ${n} similar photos`
          ) : (
            <button
              onClick={() => setZoomedIndex(null)}
              className="text-[13.5px]"
              style={{ color: 'var(--panel)' }}
            >
              ← Back to grid
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2.5 py-1 text-[13px]"
          style={{ color: 'var(--panel)', border: '1px solid rgba(255,255,255,0.25)' }}
        >
          Close (Esc)
        </button>
      </div>

      {zoomedIndex === null ? (
        <div
          className="grid flex-1 gap-3 overflow-auto p-5 pt-0"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '1fr' }}
        >
          {group.files.map((f, i) => {
            const isKeep = i === keepIndex && !ui.skipped
            return (
              <div
                key={f.path}
                className="relative flex min-h-[160px] flex-col overflow-hidden rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <button
                  onClick={() => setZoomedIndex(i)}
                  className="relative min-h-0 flex-1 cursor-zoom-in"
                  aria-label={`View ${fileName(f.path)} full size`}
                >
                  <ImageThumb path={f.path} maxSize={1100} fit="contain" />
                </button>
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ background: 'rgba(0,0,0,0.35)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px]" style={{ color: 'var(--panel)' }}>
                      {relativePath(f.path, commonDir)}
                    </div>
                    <div className="truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {formatDate(f.mtime)} · {formatBytes(f.size)}
                    </div>
                  </div>
                  <button
                    onClick={() => !ui.skipped && onSetKeepIndex(i)}
                    disabled={ui.skipped}
                    className="flex-none whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9.5px] tracking-[0.05em] disabled:cursor-default"
                    style={
                      ui.skipped || isKeep
                        ? { background: 'var(--tint)', color: 'var(--accent)' }
                        : { border: '1px solid rgba(255,255,255,0.3)', color: 'var(--panel)' }
                    }
                  >
                    {ui.skipped || isKeep ? 'KEEP' : 'Keep this'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden px-16 pb-16">
          {n > 1 && (
            <>
              <button
                onClick={() => setZoomedIndex((i) => (i === null ? i : (i - 1 + n) % n))}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--panel)' }}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                onClick={() => setZoomedIndex((i) => (i === null ? i : (i + 1) % n))}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--panel)' }}
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}

          <div className="flex h-full w-full flex-col items-center gap-3">
            <div className="min-h-0 w-full flex-1">
              <ImageThumb key={group.files[zoomedIndex].path} path={group.files[zoomedIndex].path} maxSize={2000} fit="contain" />
            </div>
            <div className="flex flex-none items-center gap-3 text-center">
              <div>
                <div className="text-[12.5px]" style={{ color: 'var(--panel)' }}>
                  {relativePath(group.files[zoomedIndex].path, commonDir)}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {formatDate(group.files[zoomedIndex].mtime)} · {formatBytes(group.files[zoomedIndex].size)} ·{' '}
                  {zoomedIndex + 1} / {n}
                </div>
              </div>
              <button
                onClick={() => !ui.skipped && onSetKeepIndex(zoomedIndex)}
                disabled={ui.skipped}
                className="flex-none whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.05em] disabled:cursor-default"
                style={
                  ui.skipped || zoomedIndex === keepIndex
                    ? { background: 'var(--tint)', color: 'var(--accent)' }
                    : { border: '1px solid rgba(255,255,255,0.3)', color: 'var(--panel)' }
                }
              >
                {ui.skipped || zoomedIndex === keepIndex ? 'KEEP' : 'Keep this'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
