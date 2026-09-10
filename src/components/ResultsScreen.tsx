import type { DuplicateGroup } from '../lib/api'
import { formatBytes } from '../lib/format'
import { reclaimableBytes, type GroupUiState } from '../lib/groups'
import { GroupCard } from './GroupCard'
import { ConfirmModal } from './ConfirmModal'

interface ResultsScreenProps {
  rootPath: string
  scannedCount: number
  groups: DuplicateGroup[]
  groupUi: Record<string, GroupUiState>
  onToggleOpen: (hash: string) => void
  onToggleSkip: (hash: string) => void
  onSetKeepIndex: (hash: string, index: number | null) => void
  showConfirm: boolean
  onOpenConfirm: () => void
  onCloseConfirm: () => void
  onCommit: () => void
  committing: boolean
}

export function ResultsScreen({
  rootPath,
  scannedCount,
  groups,
  groupUi,
  onToggleOpen,
  onToggleSkip,
  onSetKeepIndex,
  showConfirm,
  onOpenConfirm,
  onCloseConfirm,
  onCommit,
  committing,
}: ResultsScreenProps) {
  let trashCount = 0
  let keptCount = 0
  let reclaimBytes = 0
  for (const g of groups) {
    const ui = groupUi[g.content_hash]
    if (ui?.skipped) {
      keptCount += g.files.length
    } else {
      trashCount += g.files.length - 1
      keptCount += 1
      reclaimBytes += reclaimableBytes(g)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="flex flex-none items-end gap-5 p-[18px] px-6 pb-3.5"
        style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] tracking-[0.04em]" style={{ color: 'var(--ink3)' }}>
            {rootPath}
          </div>
          <div className="mt-[7px] text-xl tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>
            {groups.length} sets of identical files
          </div>
          <div className="mt-[5px] text-[13px]" style={{ color: 'var(--ink2)' }}>
            {scannedCount.toLocaleString()} files checked · biggest savings first · one copy kept
            in each set
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="text-right">
            <div className="font-mono text-[19px]" style={{ color: 'var(--ink)' }}>
              {formatBytes(reclaimBytes)}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink3)' }}>
              {trashCount.toLocaleString()} files to Trash
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

      <div className="flex-1 overflow-auto p-6 pt-2.5">
        {groups.map((g) => (
          <GroupCard
            key={g.content_hash}
            group={g}
            ui={
              groupUi[g.content_hash] ?? {
                keepIndex: null,
                skipped: false,
                open: false,
              }
            }
            onToggleOpen={() => onToggleOpen(g.content_hash)}
            onToggleSkip={() => onToggleSkip(g.content_hash)}
            onSetKeepIndex={(i) => onSetKeepIndex(g.content_hash, i)}
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
