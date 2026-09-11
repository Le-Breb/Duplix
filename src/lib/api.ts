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

export interface SimilarImageFile {
  path: string
  size: number
  mtime: number
}

export interface SimilarImageGroup {
  id: string
  max_distance: number
  files: SimilarImageFile[]
}

export interface SimilarImageGroupsResult {
  groups: SimilarImageGroup[]
  indexed_count: number
}

export interface ImageIndexProgress {
  indexed: number
  total: number
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

export function clearCache(): Promise<number> {
  return invoke('clear_cache')
}

export function getSimilarImageGroups(maxDistance: number): Promise<SimilarImageGroupsResult> {
  return invoke('get_similar_image_groups', { maxDistance })
}

export function getImageThumbnail(path: string, maxSize: number): Promise<string> {
  return invoke('get_image_thumbnail', { path, maxSize })
}

export function startImageIndexing(): Promise<void> {
  return invoke('start_image_indexing')
}

export function onImageIndexProgress(cb: (p: ImageIndexProgress) => void): Promise<UnlistenFn> {
  return listen<ImageIndexProgress>('image-index-progress', (e) => cb(e.payload))
}

export function onImageIndexComplete(cb: (p: ImageIndexProgress) => void): Promise<UnlistenFn> {
  return listen<ImageIndexProgress>('image-index-complete', (e) => cb(e.payload))
}

export function onScanProgress(cb: (p: ScanProgress) => void): Promise<UnlistenFn> {
  return listen<ScanProgress>('scan-progress', (e) => cb(e.payload))
}

export function onScanComplete(cb: (c: ScanComplete) => void): Promise<UnlistenFn> {
  return listen<ScanComplete>('scan-complete', (e) => cb(e.payload))
}
