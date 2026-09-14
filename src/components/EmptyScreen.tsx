import { useTranslation } from '../lib/i18n'

interface EmptyScreenProps {
  rootPath: string
  scanned: number
  onGoHome: () => void
}

export function EmptyScreen({ rootPath, scanned, onGoHome }: EmptyScreenProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-10">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full text-lg"
        style={{ border: '1.5px solid var(--radio)', color: 'var(--ink3)' }}
      >
        ✓
      </div>
      <div className="mt-5 text-[22px]" style={{ color: 'var(--ink)' }}>
        {t('empty.title')}
      </div>
      <div className="mt-2 text-sm" style={{ color: 'var(--ink2)' }}>
        {t('empty.description', scanned, rootPath)}
      </div>
      <button
        onClick={onGoHome}
        className="mt-6 rounded-[7px] px-5 py-[11px] text-sm"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {t('common.scanAnotherFolder')}
      </button>
    </div>
  )
}
