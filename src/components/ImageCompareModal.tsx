import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SimilarImageGroup } from '../lib/api'
import { fileName, formatBytes, formatDate, relativePath } from '../lib/format'
import { resolveKeptIndices, type ImageGroupUiState } from '../lib/groups'
import { localeFor, useTranslation } from '../lib/i18n'
import { ImageThumb } from './ImageThumb'

interface ImageCompareModalProps {
  group: SimilarImageGroup
  ui: ImageGroupUiState
  commonDir: string
  onSetKeptIndices: (keptIndices: Set<number>) => void
  onCommitNow: () => void
  committing: boolean
  onClose: () => void
}

/** Column count that keeps tiles as large as possible for a given photo
 * count: two photos get two big side-by-side panes (the common case), and
 * larger groups fall back to a denser grid rather than tiles too small to
 * compare anything in. */
function columnsFor(n: number): number {
  if (n <= 2) return n
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

// Rendered via a portal to document.body rather than in place: this modal is
// mounted from inside a group row that ImagesScreen positions with
// `transform: translateY(...)` for virtualization, and a `transform` on an
// ancestor makes `position: fixed` descendants fixed relative to *that*
// ancestor instead of the viewport — without the portal, this "full-screen"
// overlay would only ever cover that one row's box.
export function ImageCompareModal({
  group,
  ui,
  commonDir,
  onSetKeptIndices,
  onCommitNow,
  committing,
  onClose,
}: ImageCompareModalProps) {
  const { t, language } = useTranslation()
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null)
  const kept = resolveKeptIndices(group.files, ui)
  const n = group.files.length
  const allKept = kept.size === n
  const noneKept = kept.size === 0

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (zoomedIndex !== null) setZoomedIndex(null)
        else onClose()
      } else if (zoomedIndex !== null && e.key === 'ArrowRight') {
        setZoomedIndex((i) => (i === null ? i : (i + 1) % n))
      } else if (zoomedIndex !== null && e.key === 'ArrowLeft') {
        setZoomedIndex((i) => (i === null ? i : (i - 1 + n) % n))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomedIndex, n, onClose])

  const columns = columnsFor(n)

  const keepNewest = () => {
    let best = 0
    group.files.forEach((f, i) => {
      if (f.mtime > group.files[best].mtime) best = i
    })
    onSetKeptIndices(new Set([best]))
  }

  const toggleKeepAll = () => {
    onSetKeptIndices(allKept ? new Set() : new Set(group.files.map((_, i) => i)))
  }

  // Every photo's "keep" state toggles independently of the others — this is
  // what lets the user keep an arbitrary subset (2 of 5, say), not just
  // exactly one photo or all of them.
  const toggleOne = (i: number) => {
    const next = new Set(kept)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onSetKeptIndices(next)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0a0c0f' }}>
      <div className="flex flex-none flex-wrap items-center justify-between gap-2 px-5 py-3.5">
        <div className="text-[13.5px]" style={{ color: '#f4f5f7' }}>
          {zoomedIndex === null ? (
            noneKept ? (
              t('compareModal.allWillBeTrashed', n)
            ) : (
              t('compareModal.someToKeep', n, kept.size)
            )
          ) : (
            <button
              onClick={() => setZoomedIndex(null)}
              className="text-[13.5px]"
              style={{ color: '#f4f5f7' }}
            >
              {t('compareModal.backToGrid')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-stretch overflow-hidden rounded-md"
            style={{ border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)' }}
          >
            <button
              onClick={keepNewest}
              className="whitespace-nowrap px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
              style={{ color: '#f4f5f7' }}
            >
              {t('groupCard.keepNewest')}
            </button>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.16)' }} />
            <button
              onClick={toggleKeepAll}
              className="whitespace-nowrap px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
              style={{ color: '#f4f5f7' }}
            >
              {allKept ? t('compareModal.keepNone') : t('compareModal.keepAll')}
            </button>
          </div>

          <button
            onClick={onCommitNow}
            disabled={allKept || committing}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {committing ? t('imageGroupCard.trashing') : t('compareModal.trashSetNow')}
          </button>

          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
            style={{ color: '#f4f5f7', border: '1px solid rgba(255,255,255,0.16)' }}
          >
            {t('compareModal.close')}
          </button>
        </div>
      </div>

      {zoomedIndex === null ? (
        <div
          className="grid flex-1 gap-3 overflow-auto p-5 pt-0"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '1fr' }}
        >
          {group.files.map((f, i) => {
            const isKept = kept.has(i)
            return (
              <div
                key={f.path}
                className="relative flex min-h-[160px] flex-col overflow-hidden rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <button
                  onClick={() => setZoomedIndex(i)}
                  className="relative min-h-0 flex-1 cursor-zoom-in"
                  aria-label={t('compareModal.viewFullSize', fileName(f.path))}
                >
                  <ImageThumb path={f.path} maxSize={1100} fit="contain" />
                </button>
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ background: 'rgba(0,0,0,0.35)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px]" style={{ color: '#f4f5f7' }}>
                      {relativePath(f.path, commonDir)}
                    </div>
                    <div className="truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {formatDate(f.mtime, localeFor(language))} · {formatBytes(f.size)}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleOne(i)}
                    className="flex-none whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9.5px] tracking-[0.05em]"
                    style={
                      isKept
                        ? { background: 'var(--tint)', color: 'var(--accent)' }
                        : { border: '1px solid rgba(255,255,255,0.3)', color: '#f4f5f7' }
                    }
                  >
                    {isKept ? t('compareModal.keepChecked') : t('groupCard.toTrash')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden px-16 pb-16">
          {n > 1 && (
            <>
              <button
                onClick={() => setZoomedIndex((i) => (i === null ? i : (i - 1 + n) % n))}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#f4f5f7' }}
                aria-label={t('compareModal.previousPhoto')}
              >
                ‹
              </button>
              <button
                onClick={() => setZoomedIndex((i) => (i === null ? i : (i + 1) % n))}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#f4f5f7' }}
                aria-label={t('compareModal.nextPhoto')}
              >
                ›
              </button>
            </>
          )}

          <div className="flex h-full w-full flex-col items-center gap-3">
            <div className="min-h-0 w-full flex-1">
              <ImageThumb key={group.files[zoomedIndex].path} path={group.files[zoomedIndex].path} maxSize={2000} fit="contain" />
            </div>
            <div className="flex flex-none items-center gap-3 text-center">
              <div>
                <div className="text-[12.5px]" style={{ color: '#f4f5f7' }}>
                  {relativePath(group.files[zoomedIndex].path, commonDir)}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {formatDate(group.files[zoomedIndex].mtime, localeFor(language))} ·{' '}
                  {formatBytes(group.files[zoomedIndex].size)} · {zoomedIndex + 1} / {n}
                </div>
              </div>
              <button
                onClick={() => toggleOne(zoomedIndex)}
                className="flex-none whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.05em]"
                style={
                  kept.has(zoomedIndex)
                    ? { background: 'var(--tint)', color: 'var(--accent)' }
                    : { border: '1px solid rgba(255,255,255,0.3)', color: '#f4f5f7' }
                }
              >
                {kept.has(zoomedIndex) ? t('compareModal.keepChecked') : t('groupCard.toTrash')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
