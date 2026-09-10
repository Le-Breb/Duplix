import type { DuplicateGroup } from '../lib/api'
import { formatBytes, formatDate, fileExt, fileName } from '../lib/format'
import { defaultKeepIndex, reclaimableBytes, type GroupUiState } from '../lib/groups'

interface GroupCardProps {
  group: DuplicateGroup
  ui: GroupUiState
  onToggleOpen: () => void
  onToggleSkip: () => void
  onSetKeepIndex: (index: number | null) => void
}

export function GroupCard({ group, ui, onToggleOpen, onToggleSkip, onSetKeepIndex }: GroupCardProps) {
  const keepIndex = ui.keepIndex ?? defaultKeepIndex(group.files)
  const keptFile = group.files[keepIndex]
  const ext = fileExt(keptFile.path) || group.file_type.toUpperCase()
  const reclaim = reclaimableBytes(group)

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
          className="flex h-[46px] w-[46px] flex-none items-end justify-center rounded-[5px] pb-[3px]"
          style={{
            border: '1px solid var(--line)',
            background:
              'repeating-linear-gradient(135deg, var(--bg2) 0 6px, var(--stripe) 6px 12px)',
          }}
        >
          <div
            className="rounded-[2px] px-[3px] font-mono text-[8px]"
            style={{ color: 'var(--ink3)', background: 'var(--panel)' }}
          >
            {ext}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm" style={{ color: 'var(--ink)' }}>
            {fileName(keptFile.path)}
          </div>
          <div className="mt-1 truncate text-[12.5px]" style={{ color: 'var(--ink2)' }}>
            {group.files.length} identical copies · {formatBytes(group.size)} each
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
            <div className="flex-1">Pick the copy to keep</div>
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

          {group.files.map((f, i) => {
            const isKeep = i === keepIndex && !ui.skipped
            const isTrash = i !== keepIndex && !ui.skipped
            return (
              <button
                key={f.path}
                onClick={() => !ui.skipped && onSetKeepIndex(i)}
                disabled={ui.skipped}
                className="flex w-full items-center gap-3 py-2.5 pl-5 pr-3.5 text-left disabled:cursor-default"
                style={{ borderTop: '1px solid var(--line3)' }}
              >
                {isKeep || ui.skipped ? (
                  <div
                    className="flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full text-[10px]"
                    style={
                      ui.skipped
                        ? { border: '1.4px solid var(--radio)', background: 'var(--panel)' }
                        : { background: 'var(--accent)', color: 'var(--on-accent)' }
                    }
                  >
                    {!ui.skipped && '✓'}
                  </div>
                ) : (
                  <div
                    className="h-[17px] w-[17px] flex-none rounded-full"
                    style={{ border: '1.4px solid var(--radio)', background: 'var(--panel)' }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs" style={{ color: 'var(--ink)' }}>
                    {f.path}
                  </div>
                  <div className="mt-[3px] text-[11.5px]" style={{ color: 'var(--ink3)' }}>
                    Modified {formatDate(f.mtime)} · {formatBytes(group.size)}
                  </div>
                </div>
                {ui.skipped ? (
                  <div
                    className="rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                    style={{ border: '1px solid var(--line)', color: 'var(--ink3)' }}
                  >
                    KEEP
                  </div>
                ) : isKeep ? (
                  <div
                    className="rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                    style={{
                      border: '1px solid var(--tint-line)',
                      background: 'var(--tint)',
                      color: 'var(--accent)',
                    }}
                  >
                    KEEP
                  </div>
                ) : (
                  isTrash && (
                    <div
                      className="rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                      style={{
                        border: '1px solid var(--warn-line)',
                        background: 'var(--warn-bg)',
                        color: 'var(--warn-ink)',
                      }}
                    >
                      → TRASH
                    </div>
                  )
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
