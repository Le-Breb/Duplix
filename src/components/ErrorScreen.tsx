import { useTranslation } from '../lib/i18n'

interface ErrorScreenProps {
  rootPath: string
  message: string
  onGoHome: () => void
  onRetry: () => void
}

export function ErrorScreen({ rootPath, message, onGoHome, onRetry }: ErrorScreenProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-10">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
        style={{
          border: '1.5px solid var(--warn-line)',
          background: 'var(--warn-bg)',
          color: 'var(--danger)',
        }}
      >
        !
      </div>
      <div className="mt-5 text-[22px]" style={{ color: 'var(--ink)' }}>
        {t('error.title')}
      </div>
      <div
        className="mt-2 max-w-[460px] text-center text-sm leading-[1.55]"
        style={{ color: 'var(--ink2)' }}
      >
        {message}
      </div>
      <div
        className="mt-5 flex w-[460px] flex-col gap-1.5 rounded-lg p-3 px-3.5 font-mono text-[11px]"
        style={{ border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink3)' }}
      >
        {rootPath}
      </div>
      <div className="mt-[22px] flex gap-2">
        <button
          onClick={onGoHome}
          className="rounded-[7px] px-[18px] py-[11px] text-sm"
          style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)' }}
        >
          {t('error.chooseAnother')}
        </button>
        <button
          onClick={onRetry}
          className="rounded-[7px] px-[18px] py-[11px] text-sm"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {t('error.tryAgain')}
        </button>
      </div>
    </div>
  )
}
