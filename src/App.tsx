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
import { defaultKeepIndex, resolveKeptIndices, type GroupUiState, type ImageGroupUiState } from './lib/groups'

type Screen = 'home' | 'scanning' | 'results' | 'empty' | 'error' | 'done'
// Mirrors `Screen` above — the Images tab is its own independent
// pick-a-folder-and-scan flow, not something derived from the Files tab.
// There's no 'empty'/'done' state here: ImagesScreen itself renders the
// "no photos" and "nothing similar" cases inline (it's a persistent,
// incrementally-worked-through view, not a one-shot linear flow), and
// trashing never leaves 'results'.
type ImagesTabScreen = 'home' | 'scanning' | 'results' | 'error'
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

  // Only one scan (Files tab or Images tab — they share the same backend
  // scan/cancel commands and events) can meaningfully run at a time. Both
  // tabs' "choose a folder" entry points check this before starting a new
  // one, so a scan kicked off from one tab can't overlap with one kicked off
  // from the other while the user switches tabs mid-scan.
  const [scanInProgress, setScanInProgress] = useState(false)

  const [imagesScreen, setImagesScreen] = useState<ImagesTabScreen>('home')
  const [imagesBusy, setImagesBusy] = useState(false)
  const [imagesRootPath, setImagesRootPath] = useState('')
  const [imagesScanned, setImagesScanned] = useState(0)
  const [imagesCurrentPath, setImagesCurrentPath] = useState('')
  const [imagesScanError, setImagesScanError] = useState('')
  const [includeOtherFolders, setIncludeOtherFolders] = useState(false)
  const [imageThreshold, setImageThreshold] = useState(6)
  const [imageGroups, setImageGroups] = useState<SimilarImageGroup[]>([])
  const [imageGroupUi, setImageGroupUi] = useState<Record<string, ImageGroupUiState>>({})
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState('')
  const [imagesIndexedCount, setImagesIndexedCount] = useState(0)
  const [indexProgress, setIndexProgress] = useState<ImageIndexProgress | null>(null)
  const [showImageConfirm, setShowImageConfirm] = useState(false)
  const [imageCommitting, setImageCommitting] = useState(false)
  const [imageResult, setImageResult] = useState<{
    trashedCount: number
    reclaimedBytes: number
    failed: [string, string][]
  } | null>(null)
  const [committingGroupId, setCommittingGroupId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('duplix-theme', theme)
    } catch {
      // ignore
    }
  }, [theme])

  async function runScan(root: string) {
    setRootPath(root)
    setScanned(0)
    setCurrentPath('')
    setScreen('scanning')
    setScanInProgress(true)

    const unlistenProgress = await onScanProgress((p) => {
      setScanned(p.scanned)
      setCurrentPath(p.current_path)
    })
    const unlistenComplete = await onScanComplete(async (c) => {
      unlistenProgress()
      unlistenComplete()
      setScanInProgress(false)

      if (c.canceled) {
        setScreen('home')
        return
      }

      setScanned(c.scanned)
      try {
        const found = await getDuplicateGroups(root)
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
      setScanInProgress(false)
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

  async function loadImageGroups(threshold: number, root: string, includeOther: boolean) {
    setImagesLoading(true)
    setImagesError('')
    try {
      const res = await getSimilarImageGroups(threshold, includeOther ? null : root)
      setImageGroups(res.groups)
      setImagesIndexedCount(res.indexed_count)
    } catch (e) {
      setImagesError(String(e))
    } finally {
      setImagesLoading(false)
    }
  }

  // Computes perceptual hashes for any image that still needs one (new
  // photos from the folder just scanned, plus anything left over from a
  // previous session) and then loads similarity groups. Separate from the
  // file scan itself — see README "Near-duplicate image detection" for why.
  async function ensureImagesIndexed(root: string) {
    setImagesLoading(true)
    setImagesError('')
    setIndexProgress(null)

    const unlistenProgress = await onImageIndexProgress((p) => setIndexProgress(p))
    const unlistenComplete = await onImageIndexComplete(async () => {
      unlistenProgress()
      unlistenComplete()
      setIndexProgress(null)
      await loadImageGroups(imageThreshold, root, includeOtherFolders)
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

  async function runImagesScan(root: string) {
    setImagesRootPath(root)
    setImagesScanned(0)
    setImagesCurrentPath('')
    setImagesScreen('scanning')
    setScanInProgress(true)

    const unlistenProgress = await onScanProgress((p) => {
      setImagesScanned(p.scanned)
      setImagesCurrentPath(p.current_path)
    })
    const unlistenComplete = await onScanComplete(async (c) => {
      unlistenProgress()
      unlistenComplete()
      setScanInProgress(false)

      if (c.canceled) {
        setImagesScreen('home')
        return
      }

      setImagesScanned(c.scanned)
      setImagesScreen('results')
      setImageGroups([])
      setImageGroupUi({})
      await ensureImagesIndexed(root)
    })

    try {
      await startScan(root)
    } catch (e) {
      unlistenProgress()
      unlistenComplete()
      setScanInProgress(false)
      setImagesScanError(String(e))
      setImagesScreen('error')
    }
  }

  async function handleChooseImagesFolder() {
    setImagesBusy(true)
    try {
      const path = await pickFolder()
      if (path) await runImagesScan(path)
    } finally {
      setImagesBusy(false)
    }
  }

  async function handleCancelImagesScan() {
    await cancelScan()
  }

  function goImagesHome() {
    setImagesScreen('home')
    setImageGroups([])
    setImageGroupUi({})
    setImagesIndexedCount(0)
    setImageResult(null)
    setImagesError('')
  }

  // Sets (replaces, doesn't merge) which photos in one group are kept — the
  // only mutation the Images tab needs: "keep newest" / "keep shortest
  // path" / "select all" / "select none" / toggling one photo all reduce to
  // "here is the new complete set of kept indices."
  function setImageKeptIndices(id: string, keptIndices: Set<number>) {
    setImageGroupUi((prev) => ({ ...prev, [id]: { keptIndices } }))
  }

  function handleChangeImageThreshold(value: number) {
    setImageThreshold(value)
    loadImageGroups(value, imagesRootPath, includeOtherFolders)
  }

  function handleToggleIncludeOtherFolders(value: boolean) {
    setIncludeOtherFolders(value)
    loadImageGroups(imageThreshold, imagesRootPath, value)
  }

  async function handleCommitImages() {
    setImageCommitting(true)
    const sizeByPath = new Map<string, number>()
    const toTrash: string[] = []

    for (const g of imageGroups) {
      g.files.forEach((f) => sizeByPath.set(f.path, f.size))
      const kept = resolveKeptIndices(g.files, imageGroupUi[g.id])
      g.files.forEach((f, i) => {
        if (!kept.has(i)) toTrash.push(f.path)
      })
    }

    try {
      const outcome = await trashFiles(toTrash)
      const reclaimedBytes = outcome.trashed.reduce((sum, p) => sum + (sizeByPath.get(p) ?? 0), 0)
      setImageResult({ trashedCount: outcome.trashed.length, reclaimedBytes, failed: outcome.failed })
      setShowImageConfirm(false)
      await loadImageGroups(imageThreshold, imagesRootPath, includeOtherFolders)
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
    const kept = resolveKeptIndices(group.files, imageGroupUi[group.id])
    const toTrash = group.files.filter((_, i) => !kept.has(i)).map((f) => f.path)
    if (toTrash.length === 0) return

    const sizeByPath = new Map(group.files.map((f) => [f.path, f.size]))
    setCommittingGroupId(group.id)
    try {
      const outcome = await trashFiles(toTrash)
      const reclaimedBytes = outcome.trashed.reduce((sum, p) => sum + (sizeByPath.get(p) ?? 0), 0)
      setImageResult({ trashedCount: outcome.trashed.length, reclaimedBytes, failed: outcome.failed })
      await loadImageGroups(imageThreshold, imagesRootPath, includeOtherFolders)
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
            {screen === 'home' && <HomeScreen onChooseFolder={handleChooseFolder} busy={busy || scanInProgress} />}

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
          <>
            {imagesScreen === 'home' && (
              <HomeScreen
                onChooseFolder={handleChooseImagesFolder}
                busy={imagesBusy || scanInProgress}
                variant="images"
              />
            )}

            {imagesScreen === 'scanning' && (
              <ScanningScreen
                rootPath={imagesRootPath}
                scanned={imagesScanned}
                currentPath={imagesCurrentPath}
                onCancel={handleCancelImagesScan}
              />
            )}

            {imagesScreen === 'error' && (
              <ErrorScreen
                rootPath={imagesRootPath}
                message={imagesScanError}
                onGoHome={goImagesHome}
                onRetry={() => runImagesScan(imagesRootPath)}
              />
            )}

            {imagesScreen === 'results' && (
              <ImagesScreen
                rootPath={imagesRootPath}
                onChangeFolder={goImagesHome}
                groups={imageGroups}
                groupUi={imageGroupUi}
                loading={imagesLoading}
                indexProgress={indexProgress}
                error={imagesError}
                hasIndexedImages={imagesIndexedCount > 0}
                threshold={imageThreshold}
                onChangeThreshold={handleChangeImageThreshold}
                includeOtherFolders={includeOtherFolders}
                onToggleIncludeOtherFolders={handleToggleIncludeOtherFolders}
                onSetKeptIndices={setImageKeptIndices}
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
          </>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}
