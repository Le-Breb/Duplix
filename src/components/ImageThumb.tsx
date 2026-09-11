import { useEffect, useRef, useState } from 'react'
import { requestThumbnail } from '../lib/thumbnailQueue'
import { whenVisible } from '../lib/visibilityObserver'

interface ImageThumbProps {
  path: string
  /** Longest-side cap for the decoded preview. Small grid tiles want a small,
   * cheap thumbnail; the comparison view wants a much bigger one. */
  maxSize?: number
  /** 'cover' crops to fill the box (grid tiles); 'contain' shows the whole
   * image letterboxed (comparison view, where cropping would hide the thing
   * being compared). */
  fit?: 'cover' | 'contain'
}

export function ImageThumb({ path, maxSize = 220, fit = 'cover' }: ImageThumbProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Lazily seeded so an environment without IntersectionObserver just shows
  // everything immediately, without a setState-in-effect render cascade.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const rootRef = useRef<HTMLDivElement>(null)

  // Don't even request a thumbnail until it's about to be on screen — most
  // groups in a long list are scrolled well out of view, and requesting all
  // of them up front is exactly what causes the load to spike and the UI to
  // stall right after indexing finishes.
  useEffect(() => {
    if (visible) return
    const el = rootRef.current
    if (!el) return
    return whenVisible(el, () => setVisible(true))
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    requestThumbnail(path, maxSize)
      .then((data) => {
        if (!cancelled) setSrc(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [visible, path, maxSize])

  return (
    <div ref={rootRef} className="h-full w-full">
      {failed ? (
        <div
          className="flex h-full w-full items-center justify-center font-mono text-[9px]"
          style={{ background: 'var(--bg2)', color: 'var(--ink4)' }}
        >
          N/A
        </div>
      ) : src ? (
        <img
          src={src}
          alt=""
          decoding="async"
          loading="lazy"
          className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />
      ) : (
        <div className="h-full w-full" style={{ background: 'var(--bg2)' }} />
      )}
    </div>
  )
}
