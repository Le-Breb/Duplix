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

/** `path` relative to the folder the user chose to scan, so each photo's
 * location reads the same way the user thinks about it ("2021/trip/a.jpg"
 * under their chosen folder). With "include other folders" on, a match can
 * live outside that folder entirely — there's nothing meaningful to be
 * relative to then, so the full path is shown instead of a misleading one. */
export function relativePath(path: string, root: string): string {
  const base = root.replace(/[\\/]+$/, '')
  if (!base || !path.startsWith(base) || !/[\\/]/.test(path.charAt(base.length))) return path
  return path.slice(base.length + 1)
}
