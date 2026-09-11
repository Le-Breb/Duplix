import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { HomeScreen } from './components/HomeScreen'
import { ScanningScreen } from './components/ScanningScreen'
import { ResultsScreen } from './components/ResultsScreen'
import { EmptyScreen } from './components/EmptyScreen'
import { ErrorScreen } from './components/ErrorScreen'
import { DoneScreen } from './components/DoneScreen'
import { SettingsModal } from './components/SettingsModal'
import { ImagesScreen } from './components/ImagesScreen'
import {
  cancelScan,
  getDuplicateGroups,
  getSimilarImageGroups,
  onImageIndexComplete,
  onImageIndexProgress,
  onScanComplete,
  onScanProgress,
  pickFolder,
  startImageIndexing,
  startScan,
  trashFiles,
  type DuplicateGroup,
  type ImageIndexProgress,
  type SimilarImageGroup,
} from './lib/api'
import { defaultKeepIndex, type GroupUiState } from './lib/groups'

type Screen = 'home' | 'scanning' | 'results' | 'empty' | 'error' | 'done'
type Tab = 'files' | 'images'

function loadTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('duplix-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function emptyGroupUi(): GroupUiState {
  return { keepIndex: null, skipped: false, open: false }
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme)
  const [activeTab, setActiveTab] = useState<Tab>('files')
  const [screen, setScreen] = useState<Screen>('home')
  const [busy, setBusy] = useState(false)
  const [rootPath, setRootPath] = useState('')
  const [scanned, setScanned] = useState(0)
  const [currentPath, setCurrentPath] = useState('')
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [groupUi, setGroupUi] = useState<Record<string, GroupUiState>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [doneResult, setDoneResult] = useState({ trashedCount: 0, reclaimedBytes: 0, failed: [] as [string, string][] })

  const [imageThreshold, setImageThreshold] = useState(6)
  const [imageGroups, setImageGroups] = useState<SimilarImageGroup[]>([])
  const [imageGroupUi, setImageGroupUi] = useState<Record<string, GroupUiState>>({})
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState('')
  const [imagesIndexedCount, setImagesIndexedCount] = useState(0)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [indexProgress, setIndexProgress] = useState<ImageIndexProgress | null>(null)
  const [showImageConfirm, setShowImageConfirm] = useState(false)
  const [imageCommitting, setImageCommitting] = useState(false)
  const [imageResult, setImageResult] = useState<{ trashedCount: number; reclaimedBytes: number } | null>(null)
  const [committingGroupId, setCommittingGroupId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('duplix-theme', theme)
    } catch {
      // ignore
    }
  }, [theme])

  useEffect(() => {
    if (activeTab === 'images' && !imagesLoaded) {
      ensureImagesIndexed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, imagesLoaded])

  async function runScan(root: string) {
    setRootPath(root)
    setScanned(0)
    setCurrentPath('')
    setScreen('scanning')

    const unlistenProgress = await onScanProgress((p) => {
      setScanned(p.scanned)
      setCurrentPath(p.current_path)
    })
    const unlistenComplete = await onScanComplete(async (c) => {
      unlistenProgress()
      unlistenComplete()

      if (c.canceled) {
        setScreen('home')
        return
      }

      setScanned(c.scanned)
      setImagesLoaded(false) // new files may have been indexed; refresh Images tab next time it's opened
      try {
        const found = await getDuplicateGroups()
        if (found.length === 0) {
          setScreen('empty')
          return
        }
        setGroups(found)
        setGroupUi({})
        setScreen('results')
      } catch (e) {
        setErrorMessage(String(e))
        setScreen('error')
      }
    })

    try {
      await startScan(root)
    } catch (e) {
      unlistenProgress()
      unlistenComplete()
      setErrorMessage(String(e))
      setScreen('error')
    }
  }

  async function handleChooseFolder() {
    setBusy(true)
    try {
      const path = await pickFolder()
      if (path) await runScan(path)
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelScan() {
    await cancelScan()
  }

  function goHome() {
    setScreen('home')
    setGroups([])
    setGroupUi({})
    setShowConfirm(false)
  }

  function patchGroupUi(hash: string, patch: Partial<GroupUiState>) {
    setGroupUi((prev) => ({
      ...prev,
      [hash]: { ...emptyGroupUi(), ...prev[hash], ...patch },
    }))
  }

  async function loadImageGroups(threshold: number) {
    setImagesLoading(true)
    setImagesError('')
    try {
      const res = await getSimilarImageGroups(threshold)
      setImageGroups(res.groups)
      setImagesIndexedCount(res.indexed_count)
      setImagesLoaded(true)
    } catch (e) {
      setImagesError(String(e))
    } finally {
      setImagesLoading(false)
    }
  }

  async function ensureImagesIndexed() {
    setImagesLoading(true)
    setImagesError('')
    setIndexProgress(null)

    const unlistenProgress = await onImageIndexProgress((p) => setIndexProgress(p))
    const unlistenComplete = await onImageIndexComplete(async () => {
      unlistenProgress()
      unlistenComplete()
      setIndexProgress(null)
      await loadImageGroups(imageThreshold)
    })

    try {
      await startImageIndexing()
    } catch (e) {
      unlistenProgress()
      unlistenComplete()
      setImagesError(String(e))
      setImagesLoading(false)
    }
  }

  function patchImageGroupUi(id: string, patch: Partial<GroupUiState>) {
    setImageGroupUi((prev) => ({
      ...prev,
      [id]: { ...emptyGroupUi(), ...prev[id], ...patch },
    }))
  }

  function handleChangeImageThreshold(value: number) {
    setImageThreshold(value)
    loadImageGroups(value)
  }

  async function handleCommitImages() {
    setImageCommitting(true)
    const sizeByPath = new Map<string, number>()
    const toTrash: string[] = []

    for (const g of imageGroups) {
      g.files.forEach((f) => sizeByPath.set(f.path, f.size))
      const ui = imageGroupUi[g.id]
      if (ui?.skipped) continue
      const keepIdx = ui?.keepIndex ?? defaultKeepIndex(g.files)
      g.files.forEach((f, i) => {
        if (i !== keepIdx) toTrash.push(f.path)
      })
    }

    try {
      const outcome = await trashFiles(toTrash)
      const reclaimedBytes = outcome.trashed.reduce((sum, p) => sum + (sizeByPath.get(p) ?? 0), 0)
      setImageResult({ trashedCount: outcome.trashed.length, reclaimedBytes })
      setShowImageConfirm(false)
      await loadImageGroups(imageThreshold)
    } catch (e) {
      setImagesError(String(e))
    } finally {
      setImageCommitting(false)
    }
  }

  // Trashes just one group's non-kept photos immediately, without touching
  // any other group — for working through a huge scan incrementally across
  // multiple sessions instead of needing to review every group before
  // anything can be committed.
  async function handleCommitGroupNow(group: SimilarImageGroup) {
    const ui = imageGroupUi[group.id]
    if (ui?.skipped) return
    const keepIdx = ui?.keepIndex ?? defaultKeepIndex(group.files)
    const toTrash = group.files.filter((_, i) => i !== keepIdx).map((f) => f.path)
    if (toTrash.length === 0) return

    const sizeByPath = new Map(group.files.map((f) => [f.path, f.size]))
    setCommittingGroupId(group.id)
    try {
      const outcome = await trashFiles(toTrash)
      const reclaimedBytes = outcome.trashed.reduce((sum, p) => sum + (sizeByPath.get(p) ?? 0), 0)
      setImageResult({ trashedCount: outcome.trashed.length, reclaimedBytes })
      await loadImageGroups(imageThreshold)
    } catch (e) {
      setImagesError(String(e))
    } finally {
      setCommittingGroupId(null)
    }
  }

  async function handleCommit() {
    setCommitting(true)
    const sizeByPath = new Map<string, number>()
    const toTrash: string[] = []

    for (const g of groups) {
      g.files.forEach((f) => sizeByPath.set(f.path, g.size))
      const ui = groupUi[g.content_hash]
      if (ui?.skipped) continue
      const keepIdx = ui?.keepIndex ?? defaultKeepIndex(g.files)
      g.files.forEach((f, i) => {
        if (i !== keepIdx) toTrash.push(f.path)
      })
    }

    try {
      const outcome = await trashFiles(toTrash)
      const reclaimedBytes = outcome.trashed.reduce((sum, p) => sum + (sizeByPath.get(p) ?? 0), 0)
      setDoneResult({ trashedCount: outcome.trashed.length, reclaimedBytes, failed: outcome.failed })
      setShowConfirm(false)
      setScreen('done')
    } catch (e) {
      setErrorMessage(String(e))
      setScreen('error')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        isDark={theme === 'dark'}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenSettings={() => setShowSettings(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {activeTab === 'files' && (
          <>
            {screen === 'home' && <HomeScreen onChooseFolder={handleChooseFolder} busy={busy} />}

            {screen === 'scanning' && (
              <ScanningScreen
                rootPath={rootPath}
                scanned={scanned}
                currentPath={currentPath}
                onCancel={handleCancelScan}
              />
            )}

            {screen === 'results' && (
              <ResultsScreen
                rootPath={rootPath}
                scannedCount={scanned}
                groups={groups}
                groupUi={groupUi}
                onToggleOpen={(hash) => patchGroupUi(hash, { open: !groupUi[hash]?.open })}
                onToggleSkip={(hash) => patchGroupUi(hash, { skipped: !groupUi[hash]?.skipped })}
                onSetKeepIndex={(hash, index) => patchGroupUi(hash, { keepIndex: index })}
                showConfirm={showConfirm}
                onOpenConfirm={() => setShowConfirm(true)}
                onCloseConfirm={() => setShowConfirm(false)}
                onCommit={handleCommit}
                committing={committing}
              />
            )}

            {screen === 'empty' && <EmptyScreen rootPath={rootPath} scanned={scanned} onGoHome={goHome} />}

            {screen === 'error' && (
              <ErrorScreen
                rootPath={rootPath}
                message={errorMessage}
                onGoHome={goHome}
                onRetry={() => runScan(rootPath)}
              />
            )}

            {screen === 'done' && (
              <DoneScreen
                trashedCount={doneResult.trashedCount}
                reclaimedBytes={doneResult.reclaimedBytes}
                failed={doneResult.failed}
                onGoHome={goHome}
              />
            )}
          </>
        )}

        {activeTab === 'images' && (
          <ImagesScreen
            groups={imageGroups}
            groupUi={imageGroupUi}
            loading={imagesLoading}
            indexProgress={indexProgress}
            error={imagesError}
            hasIndexedImages={imagesIndexedCount > 0}
            threshold={imageThreshold}
            onChangeThreshold={handleChangeImageThreshold}
            onToggleSkip={(id) => patchImageGroupUi(id, { skipped: !imageGroupUi[id]?.skipped })}
            onSetKeepIndex={(id, index) => patchImageGroupUi(id, { keepIndex: index })}
            showConfirm={showImageConfirm}
            onOpenConfirm={() => setShowImageConfirm(true)}
            onCloseConfirm={() => setShowImageConfirm(false)}
            onCommit={handleCommitImages}
            committing={imageCommitting}
            onCommitGroup={handleCommitGroupNow}
            committingGroupId={committingGroupId}
            lastResult={imageResult}
            onDismissResult={() => setImageResult(null)}
          />
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}
