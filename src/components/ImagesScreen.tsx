import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ImageIndexProgress, SimilarImageGroup } from '../lib/api'
import { formatBytes } from '../lib/format'
import { resolveKeptIndices, type ImageGroupUiState } from '../lib/groups'
import { ImageGroupCard } from './ImageGroupCard'
import { ConfirmModal } from './ConfirmModal'

interface ImagesScreenProps {
  groups: SimilarImageGroup[]
  groupUi: Record<string, ImageGroupUiState>
  loading: boolean
  indexProgress: ImageIndexProgress | null
  error: string
  hasIndexedImages: boolean
  threshold: number
  onChangeThreshold: (value: number) => void
  onSetKeptIndices: (id: string, keptIndices: Set<number>) => void
  showConfirm: boolean
  onOpenConfirm: () => void
  onCloseConfirm: () => void
  onCommit: () => void
  committing: boolean
  onCommitGroup: (group: SimilarImageGroup) => void
  committingGroupId: string | null
  lastResult: { trashedCount: number; reclaimedBytes: number; failed: [string, string][] } | null
  onDismissResult: () => void
}

// A single shared instance, not a function that allocates a fresh object per
// call: useVirtualizer re-renders this component on every scroll frame, and
// every visible ImageGroupCard was getting a *new* fallback ui object each
// time (for any group the user hasn't touched yet), which alone defeats any
// memoization downstream — React.memo can't tell "nothing changed" from
// "here's a different-looking object that happens to have the same values."
const EMPTY_UI: ImageGroupUiState = { keptIndices: null }

export function ImagesScreen({
  groups,
  groupUi,
  loading,
  indexProgress,
  error,
  hasIndexedImages,
  threshold,
  onChangeThreshold,
  onSetKeptIndices,
  showConfirm,
  onOpenConfirm,
  onCloseConfirm,
  onCommit,
  committing,
  onCommitGroup,
  committingGroupId,
  lastResult,
  onDismissResult,
}: ImagesScreenProps) {
  const [sliderValue, setSliderValue] = useState(threshold)
  const scrollRef = useRef<HTMLDivElement>(null)

  // The group list is virtualized: with hundreds of groups, keeping every
  // one of them mounted made every scroll frame pay for laying out and
  // painting elements nowhere near the viewport. Only rows actually near the
  // visible area get rendered. Every row is now a fixed-height summary (the
  // comparison view is a full-screen overlay, not an inline expand), so
  // estimateSize is exact rather than just a starting guess — measureElement
  // is kept anyway as a defensive correction, cheap since it won't find
  // anything to correct.
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 74,
    overscan: 6,
  })

  useEffect(() => {
    setSliderValue(threshold)
  }, [threshold])

  useEffect(() => {
    if (sliderValue === threshold) return
    const t = setTimeout(() => onChangeThreshold(sliderValue), 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliderValue])

  // Memoized deliberately: useVirtualizer re-renders this component on every
  // scroll frame (that's how it knows which rows are visible), and this
  // O(total photos) loop was re-running right along with it — completely
  // unrelated to thumbnail loading, but a real, synchronous, main-thread
  // cost paid on every single scroll tick regardless of how many groups
  // were actually visible. That was a genuine remaining cause of scroll
  // jank, separate from (and in addition to) the thumbnail-loading fixes.
  const { trashCount, keptCount, reclaimBytes } = useMemo(() => {
    let trashCount = 0
    let keptCount = 0
    let reclaimBytes = 0
    for (const g of groups) {
      const kept = resolveKeptIndices(g.files, groupUi[g.id])
      g.files.forEach((f, i) => {
        if (kept.has(i)) {
          keptCount += 1
        } else {
          trashCount += 1
          reclaimBytes += f.size
        }
      })
    }
    return { trashCount, keptCount, reclaimBytes }
  }, [groups, groupUi])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="flex flex-none flex-col gap-3 p-[18px] px-6 pb-3.5"
        style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}
      >
        <div className="flex items-end gap-5">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] tracking-[0.04em]" style={{ color: 'var(--ink3)' }}>
              ACROSS EVERY SCANNED FOLDER
            </div>
            <div className="mt-[7px] text-xl tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>
              {groups.length} sets of similar photos
            </div>
            <div className="mt-[5px] text-[13px]" style={{ color: 'var(--ink2)' }}>
              Grouped by visual similarity, not just identical bytes — resized, recompressed, or
              lightly edited copies count too.
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="text-right">
              <div className="font-mono text-[19px]" style={{ color: 'var(--ink)' }}>
                {formatBytes(reclaimBytes)}
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink3)' }}>
                {trashCount.toLocaleString()} photos to Trash
              </div>
            </div>
            <button
              onClick={onOpenConfirm}
              disabled={trashCount === 0}
              className="whitespace-nowrap rounded-[7px] px-[18px] py-[11px] text-sm disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Move to Trash…
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="font-mono text-[10.5px] tracking-[0.05em]" style={{ color: 'var(--ink3)' }}>
            STRICT
          </div>
          <input
            type="range"
            min={0}
            max={16}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            className="h-1 flex-1 accent-[var(--accent)]"
            style={{ accentColor: 'var(--accent)' }}
          />
          <div className="font-mono text-[10.5px] tracking-[0.05em]" style={{ color: 'var(--ink3)' }}>
            LOOSE
          </div>
        </div>
      </div>

      {lastResult && (
        <div className="mx-6 mt-3 flex flex-col gap-2">
          {lastResult.trashedCount > 0 && (
            <div
              className="flex items-center justify-between rounded-md px-3.5 py-2.5 text-[12.5px]"
              style={{ border: '1px solid var(--tint-line)', background: 'var(--tint)', color: 'var(--accent)' }}
            >
              <div>
                {lastResult.trashedCount.toLocaleString()} photos sent to Trash ·{' '}
                {formatBytes(lastResult.reclaimedBytes)} reclaimed
              </div>
              {lastResult.failed.length === 0 && (
                <button onClick={onDismissResult} className="text-[11px]" style={{ color: 'var(--accent)' }}>
                  Dismiss
                </button>
              )}
            </div>
          )}
          {lastResult.failed.length > 0 && (
            <div
              className="flex flex-col gap-1.5 rounded-md px-3.5 py-2.5 text-[12.5px]"
              style={{ border: '1px solid var(--warn-line)', background: 'var(--warn-bg)', color: 'var(--warn-ink)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  {lastResult.failed.length.toLocaleString()} photo{lastResult.failed.length === 1 ? '' : 's'} could
                  not be moved to Trash
                </div>
                <button onClick={onDismissResult} className="text-[11px]" style={{ color: 'var(--warn-ink)' }}>
                  Dismiss
                </button>
              </div>
              {lastResult.failed.slice(0, 5).map(([path, reason]) => (
                <div key={path} className="truncate font-mono text-[11px]" title={`${path} — ${reason}`}>
                  {path} — {reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto p-6 pt-2.5">
        {loading && indexProgress && indexProgress.total > 0 && (
          <div className="mx-auto mt-16 max-w-[360px]">
            <div className="text-center text-sm" style={{ color: 'var(--ink2)' }}>
              Indexing photos… {indexProgress.indexed.toLocaleString()} / {indexProgress.total.toLocaleString()}
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full"
              style={{ background: 'var(--bg2)' }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(100, (indexProgress.indexed / indexProgress.total) * 100)}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
            <div className="mt-2 text-center text-[11.5px]" style={{ color: 'var(--ink3)' }}>
              Only needed once per photo — future visits are instant.
            </div>
          </div>
        )}

        {loading && !(indexProgress && indexProgress.total > 0) && (
          <div className="mt-10 text-center text-sm" style={{ color: 'var(--ink3)' }}>
            Comparing photos…
          </div>
        )}

        {!loading && error && (
          <div className="mt-10 text-center text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {!loading && !error && !hasIndexedImages && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="text-[15px]" style={{ color: 'var(--ink)' }}>
              No photos indexed yet
            </div>
            <div className="mt-2 max-w-[380px] text-sm" style={{ color: 'var(--ink2)' }}>
              Scan a folder from the Files tab first — Duplix compares photos across every folder
              you've scanned.
            </div>
          </div>
        )}

        {!loading && !error && hasIndexedImages && groups.length === 0 && (
          <div className="mt-10 text-center text-sm" style={{ color: 'var(--ink2)' }}>
            No similar photos found at this sensitivity. Try loosening it.
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const g = groups[virtualRow.index]
              return (
                <div
                  key={g.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ImageGroupCard
                    group={g}
                    ui={groupUi[g.id] ?? EMPTY_UI}
                    onSetKeptIndices={onSetKeptIndices}
                    onCommitGroup={onCommitGroup}
                    committing={committingGroupId === g.id}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          trashCount={trashCount}
          keptCount={keptCount}
          reclaimedBytes={reclaimBytes}
          onCancel={onCloseConfirm}
          onConfirm={onCommit}
          busy={committing}
        />
      )}
    </div>
  )
}
