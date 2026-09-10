import { formatBytes } from '../lib/format'

interface DoneScreenProps {
  trashedCount: number
  reclaimedBytes: number
  failed: [string, string][]
  onGoHome: () => void
}

export function DoneScreen({ trashedCount, reclaimedBytes, failed, onGoHome }: DoneScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-10">
      <div
        className="flex h-[46px] w-[46px] items-center justify-center rounded-full text-xl"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        ✓
      </div>
      <div className="mt-5 text-[22px]" style={{ color: 'var(--ink)' }}>
        {trashedCount.toLocaleString()} files sent to Trash
      </div>
      <div className="mt-2 text-sm" style={{ color: 'var(--ink2)' }}>
        {formatBytes(reclaimedBytes)} reclaimed. Your Trash still holds them if you want them back.
      </div>

      {failed.length > 0 && (
        <div
          className="mt-4 flex max-w-[460px] flex-col gap-1.5 rounded-lg p-3 px-3.5 font-mono text-[11px]"
          style={{
            border: '1px solid var(--warn-line)',
            background: 'var(--warn-bg)',
            color: 'var(--warn-ink)',
          }}
        >
          <div>{failed.length} file(s) could not be moved to Trash:</div>
          {failed.slice(0, 5).map(([path]) => (
            <div key={path} className="truncate">
              {path}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onGoHome}
        className="mt-[30px] rounded-[7px] px-5 py-[11px] text-sm"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Scan another folder
      </button>
    </div>
  )
}
