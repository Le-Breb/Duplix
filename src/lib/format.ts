export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB'
  if (mb >= 100) return Math.round(mb) + ' MB'
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  // A real, positive, sub-1KB byte count still reads as "1 KB" (rounding
  // to 0 would misleadingly look identical to "nothing happened") — but
  // exactly 0 bytes (the `bytes <= 0` case above) must never say "1 KB".
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

export function formatDate(unixSeconds: number, locale?: string): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function fileExt(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toUpperCase()
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Everything before the filename — the folder a file lives in. */
export function fileDir(path: string): string {
  const parts = path.split(/[\\/]/)
  parts.pop()
  return parts.join('/') || '/'
}

/**
 * The deepest folder shared by every path given. Duplix's cache spans every
 * folder ever scanned, not just one, so there's no single well-defined
 * "source folder" for a photo on its own — but every photo *within one
 * similar-photo group* does share some common ancestor, which is the most
 * useful "relative to" reference point for comparing where each copy lives.
 */
export function commonDirPrefix(paths: string[]): string {
  if (paths.length === 0) return ''
  let common = fileDir(paths[0]).split(/[\\/]/)
  for (const path of paths.slice(1)) {
    const dir = fileDir(path).split(/[\\/]/)
    let i = 0
    while (i < common.length && i < dir.length && common[i] === dir[i]) i++
    common = common.slice(0, i)
  }
  return common.join('/') || '/'
}

/** `path` with the `root` prefix stripped, for display under a group's
 * shared common-ancestor folder. Falls back to just the filename if `path`
 * doesn't actually start with `root` (shouldn't happen given how `root` is
 * computed, but keeps this from ever showing a broken half-path). */
export function relativePath(path: string, root: string): string {
  if (!path.startsWith(root)) return fileName(path)
  return path.slice(root.length).replace(/^[\\/]+/, '') || fileName(path)
}
