import { useState } from 'react'
import { clearCache } from '../lib/api'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [clearing, setClearing] = useState(false)
  const [clearedCount, setClearedCount] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function handleClearCache() {
    setClearing(true)
    setError('')
    try {
      const count = await clearCache()
      setClearedCount(count)
    } catch (e) {
      setError(String(e))
    } finally {
      setClearing(false)
    }
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-10"
      style={{ background: 'rgba(22,24,28,0.34)' }}
    >
      <div
        className="w-[430px] rounded-[10px] p-6 pb-5"
        style={{ background: 'var(--panel)', boxShadow: '0 20px 48px rgba(20,24,32,0.28)' }}
      >
        <div className="text-[19px] tracking-[-0.01em]" style={{ color: 'var(--ink)' }}>
          Settings
        </div>

        <div className="mt-4 overflow-hidden rounded-md" style={{ border: '1px solid var(--line)' }}>
          <div className="p-3.5">
            <div className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
              Clear scan cache
            </div>
            <div className="mt-1 text-[12.5px] leading-[1.5]" style={{ color: 'var(--ink2)' }}>
              Duplix remembers file hashes so re-scanning an unchanged folder is fast. Clearing
              the cache removes that history — nothing on disk is touched, and the next scan of
              any folder will re-hash everything from scratch.
            </div>
            {clearedCount !== null && !error && (
              <div className="mt-2 text-[12.5px]" style={{ color: 'var(--accent)' }}>
                Cache cleared — {clearedCount.toLocaleString()} entries removed.
              </div>
            )}
            {error && (
              <div className="mt-2 text-[12.5px]" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            <button
              onClick={handleClearCache}
              disabled={clearing}
              className="mt-3 rounded-md px-3.5 py-2 text-[12.5px] disabled:opacity-60"
              style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)' }}
            >
              {clearing ? 'Clearing…' : 'Clear cache'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2.5 text-[13.5px]"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
