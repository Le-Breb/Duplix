import { useState } from 'react'
import { clearCache } from '../lib/api'
import { useTranslation, type Language } from '../lib/i18n'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t, language, setLanguage } = useTranslation()
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
          {t('settings.title')}
        </div>

        <div className="mt-4 overflow-hidden rounded-md" style={{ border: '1px solid var(--line)' }}>
          <div className="p-3.5">
            <div className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
              {t('settings.languageTitle')}
            </div>
            <div className="mt-1 text-[12.5px] leading-[1.5]" style={{ color: 'var(--ink2)' }}>
              {t('settings.languageDescription')}
            </div>
            <div
              className="mt-3 flex items-stretch overflow-hidden rounded-md"
              style={{ border: '1px solid var(--line2)', width: 'fit-content' }}
            >
              {(['en', 'fr'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className="px-3.5 py-2 text-[12.5px]"
                  style={
                    language === lang
                      ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                      : { background: 'var(--panel)', color: 'var(--ink)' }
                  }
                >
                  {lang === 'en' ? 'English' : 'Français'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-md" style={{ border: '1px solid var(--line)' }}>
          <div className="p-3.5">
            <div className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
              {t('settings.clearCacheTitle')}
            </div>
            <div className="mt-1 text-[12.5px] leading-[1.5]" style={{ color: 'var(--ink2)' }}>
              {t('settings.clearCacheDescription')}
            </div>
            {clearedCount !== null && !error && (
              <div className="mt-2 text-[12.5px]" style={{ color: 'var(--accent)' }}>
                {t('settings.cacheCleared', clearedCount)}
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
              {clearing ? t('settings.clearing') : t('settings.clearCache')}
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2.5 text-[13.5px]"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {t('settings.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
