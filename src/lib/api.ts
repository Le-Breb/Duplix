import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface FileEntry {
  path: string
  mtime: number
}

export interface DuplicateGroup {
  content_hash: string
  file_type: 'image' | 'pdf' | 'text'
  size: number
  files: FileEntry[]
}

export interface ScanProgress {
  scanned: number
  current_path: string
}

export interface ScanComplete {
  scanned: number
  skipped_dirs: number
  canceled: boolean
}

export interface TrashOutcome {
  trashed: string[]
  failed: [string, string][]
}

export function pickFolder(): Promise<string | null> {
  return invoke('pick_folder')
}

export function startScan(root: string): Promise<void> {
  return invoke('start_scan', { root })
}

export function cancelScan(): Promise<void> {
  return invoke('cancel_scan')
}

export function getDuplicateGroups(): Promise<DuplicateGroup[]> {
  return invoke('get_duplicate_groups')
}

export function trashFiles(paths: string[]): Promise<TrashOutcome> {
  return invoke('trash_files', { paths })
}

export function onScanProgress(cb: (p: ScanProgress) => void): Promise<UnlistenFn> {
  return listen<ScanProgress>('scan-progress', (e) => cb(e.payload))
}

export function onScanComplete(cb: (c: ScanComplete) => void): Promise<UnlistenFn> {
  return listen<ScanComplete>('scan-complete', (e) => cb(e.payload))
}
