import { formatBytes } from '../lib/format'
import { useTranslation } from '../lib/i18n'

interface ConfirmModalProps {
  trashCount: number
  keptCount: number
  reclaimedBytes: number
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
}

export function ConfirmModal({
  trashCount,
  keptCount,
  reclaimedBytes,
  onCancel,
  onConfirm,
  busy,
}: ConfirmModalProps) {
  const { t } = useTranslation()
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
          {t('confirm.title', trashCount)}
        </div>
        <div className="mt-2.5 text-[13.5px] leading-[1.6]" style={{ color: 'var(--ink2)' }}>
          {t('confirm.description', formatBytes(reclaimedBytes))}
        </div>
        <div className="mt-4 overflow-hidden rounded-md" style={{ border: '1px solid var(--line)' }}>
          <div className="flex justify-between px-3 py-[9px] text-[12.5px]" style={{ color: 'var(--ink2)' }}>
            <div>{t('confirm.filesMoved')}</div>
            <div className="font-mono" style={{ color: 'var(--ink)' }}>
              {trashCount.toLocaleString()}
            </div>
          </div>
          <div
            className="flex justify-between px-3 py-[9px] text-[12.5px]"
            style={{ color: 'var(--ink2)', borderTop: '1px solid var(--line3)' }}
          >
            <div>{t('confirm.filesKept')}</div>
            <div className="font-mono" style={{ color: 'var(--ink)' }}>
              {keptCount.toLocaleString()}
            </div>
          </div>
          <div
            className="flex justify-between px-3 py-[9px] text-[12.5px]"
            style={{ color: 'var(--ink2)', borderTop: '1px solid var(--line3)' }}
          >
            <div>{t('confirm.spaceReclaimed')}</div>
            <div className="font-mono" style={{ color: 'var(--ink)' }}>
              {formatBytes(reclaimedBytes)}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-4 py-2.5 text-[13.5px] disabled:opacity-60"
            style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)' }}
          >
            {t('confirm.notYet')}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md px-4 py-2.5 text-[13.5px] disabled:opacity-60"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {busy ? t('confirm.moving') : t('confirm.moveToTrashButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
