import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { HomeScreen } from './components/HomeScreen'
import { ScanningScreen } from './components/ScanningScreen'
import { ResultsScreen } from './components/ResultsScreen'
import { EmptyScreen } from './components/EmptyScreen'
import { ErrorScreen } from './components/ErrorScreen'
import { DoneScreen } from './components/DoneScreen'
import {
  cancelScan,
  getDuplicateGroups,
  onScanComplete,
  onScanProgress,
  pickFolder,
  startScan,
  trashFiles,
  type DuplicateGroup,
} from './lib/api'
import { defaultKeepIndex, type GroupUiState } from './lib/groups'

type Screen = 'home' | 'scanning' | 'results' | 'empty' | 'error' | 'done'

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
  const [screen, setScreen] = useState<Screen>('home')
  const [busy, setBusy] = useState(false)
  const [rootPath, setRootPath] = useState('')
  const [scanned, setScanned] = useState(0)
  const [currentPath, setCurrentPath] = useState('')
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [groupUi, setGroupUi] = useState<Record<string, GroupUiState>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [doneResult, setDoneResult] = useState({ trashedCount: 0, reclaimedBytes: 0, failed: [] as [string, string][] })

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
      <Sidebar isDark={theme === 'dark'} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />

      <div className="relative flex min-w-0 flex-1 flex-col">
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
      </div>
    </div>
  )
}
