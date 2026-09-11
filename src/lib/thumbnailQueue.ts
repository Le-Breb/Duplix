import { getImageThumbnail } from './api'

// Each thumbnail request decodes and resizes a full image on the Rust side —
// cheap for one, but dozens of ImageThumb components can mount at once (a
// list of similar-photo groups, or expanding one with many photos), and
// firing them all as concurrent IPC calls saturates every CPU core at once
// and freezes the UI until they all finish. Capping concurrency here spreads
// that work out instead, so the app stays responsive while thumbnails
// trickle in.
const MAX_CONCURRENT = 4

let active = 0
const queue: (() => void)[] = []

function runNext() {
  if (active >= MAX_CONCURRENT) return
  const next = queue.shift()
  if (next) {
    active++
    next()
  }
}

export function requestThumbnail(path: string, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      getImageThumbnail(path, maxSize)
        .then(resolve, reject)
        .finally(() => {
          active--
          runNext()
        })
    })
    runNext()
  })
}
