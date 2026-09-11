import { useEffect, useState } from 'react'
import type { ImageIndexProgress, SimilarImageGroup } from '../lib/api'
import { formatBytes } from '../lib/format'
import { defaultKeepIndex, type GroupUiState } from '../lib/groups'
import { ImageGroupCard } from './ImageGroupCard'
import { ConfirmModal } from './ConfirmModal'

interface ImagesScreenProps {
  groups: SimilarImageGroup[]
  groupUi: Record<string, GroupUiState>
  loading: boolean
  indexProgress: ImageIndexProgress | null
  error: string
  hasIndexedImages: boolean
  threshold: number
  onChangeThreshold: (value: number) => void
  onToggleOpen: (id: string) => void
  onToggleSkip: (id: string) => void
  onSetKeepIndex: (id: string, index: number | null) => void
  showConfirm: boolean
  onOpenConfirm: () => void
  onCloseConfirm: () => void
  onCommit: () => void
  committing: boolean
  lastResult: { trashedCount: number; reclaimedBytes: number } | null
  onDismissResult: () => void
}

function emptyUi(): GroupUiState {
  return { keepIndex: null, skipped: false, open: false }
}

export function ImagesScreen({
  groups,
  groupUi,
  loading,
  indexProgress,
  error,
  hasIndexedImages,
  threshold,
  onChangeThreshold,
  onToggleOpen,
  onToggleSkip,
  onSetKeepIndex,
  showConfirm,
  onOpenConfirm,
  onCloseConfirm,
  onCommit,
  committing,
  lastResult,
  onDismissResult,
}: ImagesScreenProps) {
  const [sliderValue, setSliderValue] = useState(threshold)

  useEffect(() => {
    setSliderValue(threshold)
  }, [threshold])

  useEffect(() => {
    if (sliderValue === threshold) return
    const t = setTimeout(() => onChangeThreshold(sliderValue), 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliderValue])

  let trashCount = 0
  let keptCount = 0
  let reclaimBytes = 0
  for (const g of groups) {
    const ui = groupUi[g.id]
    if (ui?.skipped) {
      keptCount += g.files.length
      continue
    }
    const keepIndex = ui?.keepIndex ?? defaultKeepIndex(g.files)
    g.files.forEach((f, i) => {
      if (i === keepIndex) {
        keptCount += 1
      } else {
        trashCount += 1
        reclaimBytes += f.size
      }
    })
  }

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
        <div
          className="mx-6 mt-3 flex items-center justify-between rounded-md px-3.5 py-2.5 text-[12.5px]"
          style={{ border: '1px solid var(--tint-line)', background: 'var(--tint)', color: 'var(--accent)' }}
        >
          <div>
            {lastResult.trashedCount.toLocaleString()} photos sent to Trash ·{' '}
            {formatBytes(lastResult.reclaimedBytes)} reclaimed
          </div>
          <button onClick={onDismissResult} className="text-[11px]" style={{ color: 'var(--accent)' }}>
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 pt-2.5">
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

        {!loading &&
          groups.map((g) => (
            <ImageGroupCard
              key={g.id}
              group={g}
              ui={groupUi[g.id] ?? emptyUi()}
              onToggleOpen={() => onToggleOpen(g.id)}
              onToggleSkip={() => onToggleSkip(g.id)}
              onSetKeepIndex={(i) => onSetKeepIndex(g.id, i)}
            />
          ))}
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
