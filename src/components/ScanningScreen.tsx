import { useState } from 'react'
import { useTranslation } from '../lib/i18n'

interface ScanningScreenProps {
  rootPath: string
  scanned: number
  currentPath: string
  onCancel: () => void
}

export function ScanningScreen({ rootPath, scanned, currentPath, onCancel }: ScanningScreenProps) {
  const [confirming, setConfirming] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-10">
      <div
        className="font-mono text-[11px] tracking-[0.1em]"
        style={{ color: 'var(--ink3)' }}
      >
        {t('scanning.label')}
      </div>
      <div className="mt-3 text-sm" style={{ color: 'var(--ink2)' }}>
        {rootPath}
      </div>
      <div
        className="mt-[22px] font-mono text-[46px] tracking-[-0.02em]"
        style={{ color: 'var(--ink)' }}
      >
        {scanned.toLocaleString()}
      </div>
      <div className="mt-1 text-[13px]" style={{ color: 'var(--ink2)' }}>
        {t('scanning.filesChecked')}
      </div>
      <div
        className="mt-[26px] h-[3px] w-[340px] overflow-hidden rounded-full"
        style={{ background: 'var(--desk)' }}
      >
        <div
          className="animate-sweep h-full w-[30%]"
          style={{ background: 'var(--accent)' }}
        />
      </div>
      <div
        className="mt-[14px] h-[14px] max-w-[460px] truncate font-mono text-[11px]"
        style={{ color: 'var(--ink4)' }}
      >
        {currentPath}
      </div>

      {confirming ? (
        <div
          className="mt-[30px] flex flex-col items-center gap-3 rounded-lg p-4 px-[18px]"
          style={{
            border: '1px solid var(--line)',
            background: 'var(--panel)',
            boxShadow: '0 2px 8px rgba(20,24,32,0.06)',
          }}
        >
          <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
            {t('scanning.confirmStop')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-md px-3.5 py-2 text-[13px]"
              style={{
                border: '1px solid var(--line2)',
                background: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              {t('scanning.stopScan')}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md px-3.5 py-2 text-[13px]"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {t('scanning.keepGoing')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="mt-[30px] rounded-md px-3.5 py-2 text-[13px]"
          style={{
            border: '1px solid var(--line2)',
            background: 'var(--panel)',
            color: 'var(--ink2)',
          }}
        >
          {t('scanning.cancelScan')}
        </button>
      )}
    </div>
  )
}
