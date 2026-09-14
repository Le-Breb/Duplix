import { useTranslation } from '../lib/i18n'

interface HomeScreenProps {
  onChooseFolder: () => void
  busy: boolean
  variant?: 'files' | 'images'
}

export function HomeScreen({ onChooseFolder, busy, variant = 'files' }: HomeScreenProps) {
  const { t } = useTranslation()
  const title = variant === 'images' ? t('home.imagesTitle') : t('home.filesTitle')
  const description = variant === 'images' ? t('home.imagesDescription') : t('home.filesDescription')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-0 p-10">
      <div
        className="mb-[26px] h-[92px] w-[92px] rounded-xl"
        style={{
          border: '1px dashed var(--line2)',
          background:
            'repeating-linear-gradient(135deg, var(--bg2) 0 7px, var(--stripe) 7px 14px)',
        }}
      />
      <div className="text-[27px] tracking-[-0.015em]" style={{ color: 'var(--ink)' }}>
        {title}
      </div>
      <div
        className="mt-[10px] max-w-[430px] text-center text-sm leading-[1.55]"
        style={{ color: 'var(--ink2)' }}
      >
        {description}
      </div>
      <button
        onClick={onChooseFolder}
        disabled={busy}
        className="mt-7 rounded-[7px] px-[22px] py-3 text-sm disabled:opacity-60"
        style={{
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          boxShadow: '0 1px 2px rgba(20,24,32,0.18)',
        }}
      >
        {busy ? t('home.working') : t('home.chooseFolder')}
      </button>
      <div className="mt-4 font-mono text-[11px]" style={{ color: 'var(--ink3)' }}>
        {t('home.trashNote')}
      </div>
    </div>
  )
}
