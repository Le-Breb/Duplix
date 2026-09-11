// A single shared IntersectionObserver for every ImageThumb, instead of one
// instance per thumbnail. Scrolling a list with hundreds of thumbnails means
// hundreds of observer instances all reacting to the same scroll frame if
// each component creates its own — real, spread-out overhead that shows up
// as scroll jank even though no individual decode is blocking anything.
// Sharing one observer (and a callback map) is the standard fix.

const callbacks = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const cb = callbacks.get(entry.target)
          if (cb) {
            callbacks.delete(entry.target)
            observer?.unobserve(entry.target)
            cb()
          }
        }
      },
      { rootMargin: '300px' },
    )
  }
  return observer
}

/** Calls `onVisible` once, the first time `el` is scrolled near the viewport. */
export function whenVisible(el: Element, onVisible: () => void): () => void {
  const obs = getObserver()
  if (!obs) {
    onVisible()
    return () => {}
  }
  callbacks.set(el, onVisible)
  obs.observe(el)
  return () => {
    callbacks.delete(el)
    obs.unobserve(el)
  }
}
