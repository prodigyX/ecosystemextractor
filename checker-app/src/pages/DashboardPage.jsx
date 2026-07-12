import { useCallback, useRef, useState } from 'react'
import { Header } from '../shared/components/Header.jsx'
import { Dropzone } from '../shared/components/Dropzone.jsx'
import { CheckModePrompt } from '../shared/components/CheckModePrompt.jsx'
import { RateLimitFooter } from '../shared/components/RateLimitFooter.jsx'
import { ConfirmModal } from '../shared/components/ConfirmModal.jsx'
import { FetchOverlay } from '../shared/components/FetchOverlay.jsx'
import { computeVerdictCounts, computeQuickCounts } from '../shared/domain/scoring.js'
import { useProjects } from '../features/project-source/useProjects.js'
import { useQuickCheck } from '../features/quick-check/useQuickCheck.js'
import { useDeepCheck } from '../features/deep-check/useDeepCheck.js'
import { BatchProgressBar } from '../features/deep-check/BatchProgressBar.jsx'
import { ActivityModal } from '../features/deep-check/ActivityModal.jsx'
import { SearchAndFilters } from '../features/search-filters/SearchAndFilters.jsx'
import { filterProjects, sortProjects, computeStatusCounts } from '../features/search-filters/filters.js'
import { ResultsTable } from '../features/results-table/ResultsTable.jsx'
import { SummaryCards } from '../features/results-table/SummaryCards.jsx'
import { ProjectDetailModal } from '../features/project-detail/ProjectDetailModal.jsx'
import { useSavedRun } from '../features/saved-runs/useSavedRun.js'
import { HistoryModal } from '../features/saved-runs/HistoryModal.jsx'
import { useFavorites } from '../features/favorites/useFavorites.js'
import { downloadCsv } from '../services/csvExportService.js'
import { downloadJson } from '../services/jsonExportService.js'

const DEFAULT_SORT = { key: 'project', direction: 'asc' }

/**
 * The single dashboard page: wires together every feature's hooks and
 * composes the page layout. Kept as the one place that knows about all
 * features at once — individual features and shared/ code never import
 * from each other's siblings, only from `shared/`.
 */
export function DashboardPage() {
  const fileInputRef = useRef(null)
  const [expanded, setExpanded] = useState(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [verdictFilter, setVerdictFilter] = useState(new Set())
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [activityModalOpen, setActivityModalOpen] = useState(false)
  const [clearCacheModalOpen, setClearCacheModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  // The id of the saved run currently being fetched from the server, or the
  // '__latest__' sentinel for "Restore last run" (which has no id client-side
  // until the server resolves it) — null when nothing is loading.
  const [loadingRunId, setLoadingRunId] = useState(null)

  const projectsState = useProjects()
  const quick = useQuickCheck(projectsState.projects, projectsState.setProjects)
  const deepCheck = useDeepCheck(projectsState.projects, projectsState.setProjects, {
    onStart: () => projectsState.setParseError(null),
    onError: projectsState.setParseError,
  })
  const { isFavorite, toggleFavorite } = useFavorites()

  const deepDone = projectsState.projects.length > 0 && !deepCheck.deepRunning &&
    projectsState.projects.every((p) => deepCheck.deep[p.id]?.status === 'done')

  const quickDone = projectsState.projects.length > 0 && !quick.checking &&
    projectsState.projects.every((p) => p.websiteStatus !== 'idle' && p.websiteStatus !== 'checking')

  const savedRun = useSavedRun({
    projects: projectsState.projects,
    deep: deepCheck.deep,
    fileName: projectsState.fileName,
    checking: quick.checking,
    deepRunning: deepCheck.deepRunning,
    quickDone,
    deepDone,
  })

  // Not memoized: it's only ever invoked directly from event handlers below,
  // never passed as a dependency to another memoized hook, so a stable
  // identity across renders buys nothing here.
  const resetForNewLoad = () => {
    quick.reset()
    deepCheck.reset()
    setExpanded(new Set())
    setSearch('')
    setStatusFilter('all')
    setVerdictFilter(new Set())
    setSort(DEFAULT_SORT)
    setSelectedProjectId(null)
    savedRun.clearLoadedAt()
  }

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVerdictFilter = useCallback((key) => {
    setVerdictFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return DEFAULT_SORT
    })
  }, [])

  const onFileInput = (e) => {
    const file = e.target.files[0]
    projectsState.handleFile(file, resetForNewLoad)
    // Allow selecting the same file again after it has changed on disk.
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (busy) return
    projectsState.handleFile(e.dataTransfer.files[0], resetForNewLoad)
  }

  const busy = quick.checking || deepCheck.deepRunning || projectsState.fetching || loadingRunId != null

  const handleFetchFromBerachain = () => {
    if (busy) return
    projectsState.fetchFromBerachain(resetForNewLoad)
  }

  // Reuses the newest saved run's project list without a live Berachain
  // fetch — deliberately does NOT restore its old `deep` results, so the
  // check-mode prompt appears fresh (unlike handleLoadRun / "Restore last
  // run", which is for reviewing past results, not starting a new check).
  const handleUseLastProjectList = async () => {
    if (busy) return
    const result = await savedRun.loadRun()
    if (result.status === 'error') {
      projectsState.setParseError('Could not load saved history — the server may be unavailable.')
      return
    }
    if (result.status === 'empty') {
      projectsState.setParseError('No saved runs yet — fetch from Berachain or upload a JSON file first.')
      return
    }
    const { saved } = result
    resetForNewLoad()
    // A saved snapshot's projects carry whatever websiteStatus/xStatus they
    // had at save time (e.g. 'alive') — without resetting those, quickDone
    // reads as already-true and the fresh check-mode prompt never appears,
    // same as extractProjects() produces for a brand-new Berachain fetch.
    projectsState.setProjects(saved.projects.map((p) => ({ ...p, websiteStatus: 'idle', xStatus: 'idle' })))
    projectsState.setFileName(saved.fileName ? `${saved.fileName} (reused list)` : 'Reused project list')
    projectsState.setParseError(null)
  }

  const handleConfirmClearCache = async () => {
    const ok = await deepCheck.clearCache()
    if (ok) {
      setClearCacheModalOpen(false)
      // Cached check data AND saved run history are both gone server-side
      // now — send the user back to the first-page data-source picker
      // rather than showing a table/history list that no longer matches
      // what the server actually knows, and refresh the (now-empty) history
      // list so "Restore last run"/"Select from history" stop appearing.
      resetForNewLoad()
      projectsState.setProjects([])
      projectsState.setFileName(null)
      projectsState.setParseError(null)
      savedRun.refreshHistory()
    }
  }

  const handleStartCheck = () => {
    if (deepCheck.deepRunning) return
    quick.startCheck()
  }

  const handleStartDeepCheck = () => {
    if (quick.checking) return
    deepCheck.startDeepCheck()
  }

  const handleLoadRun = async (id = null) => {
    const result = await savedRun.loadRun(id)
    if (result.status === 'error') {
      projectsState.setParseError('Could not load saved history — the server may be unavailable.')
      return
    }
    if (result.status === 'empty') return
    const { saved } = result
    projectsState.setProjects(saved.projects)
    projectsState.setFileName(saved.fileName ?? 'saved run')
    projectsState.setParseError(null)
    deepCheck.setDeep(saved.deep ?? {})
    quick.reset()
    setExpanded(new Set())
    setSearch('')
    setStatusFilter('all')
    setVerdictFilter(new Set())
    setSelectedProjectId(null)
  }

  const handleLoadLastRun = async () => {
    setLoadingRunId('__latest__')
    try {
      await handleLoadRun()
    } finally {
      setLoadingRunId(null)
    }
  }

  const handleSelectHistory = async (id) => {
    setLoadingRunId(id)
    try {
      await handleLoadRun(id)
    } finally {
      setLoadingRunId(null)
    }
    setHistoryModalOpen(false)
  }

  const handleOpenHistory = () => {
    savedRun.refreshHistory()
    setHistoryModalOpen(true)
  }

  const handleRunNewCheck = () => {
    if (busy) return
    resetForNewLoad()
    projectsState.setProjects([])
    projectsState.setFileName(null)
    projectsState.setParseError(null)
  }

  const verdictCounts = deepDone ? computeVerdictCounts(projectsState.projects, deepCheck.deep) : null
  const quickCounts = !verdictCounts && quickDone ? computeQuickCounts(projectsState.projects) : null
  const showCheckPrompt = projectsState.projects.length > 0 &&
    !quick.checking && !deepCheck.deepRunning && !quickDone && !deepDone
  const hasCheckResults = quickDone || deepDone

  const statusCounts = computeStatusCounts(projectsState.projects, deepCheck.deep)
  const issuesCount = projectsState.projects.filter((p) =>
    ['dead', 'error', 'likely-dead'].includes(deepCheck.deep[p.id]?.verdict)
  ).length
  const filteredProjects = filterProjects(projectsState.projects, deepCheck.deep, {
    search,
    statusFilter,
    verdictFilter,
  })
  const sortedProjects = sortProjects(filteredProjects, deepCheck.deep, sort)

  const selectedProject = selectedProjectId
    ? projectsState.projects.find((p) => p.id === selectedProjectId)
    : null

  return (
    <div className={`app ${deepCheck.deepRunning ? 'app-with-batch-bar' : ''}`}>
      <Header
        fileName={projectsState.fileName}
        projectsCount={projectsState.projects.length}
        loadedAt={savedRun.loadedAt}
        checking={quick.checking}
        deepRunning={deepCheck.deepRunning}
        progress={quick.progress}
        deepProgress={deepCheck.deepProgress}
        savedMeta={savedRun.savedMeta}
        historyCount={savedRun.history.length}
        onLoadLastRun={handleLoadLastRun}
        onOpenHistory={handleOpenHistory}
        onFetchFromBerachain={handleFetchFromBerachain}
        onUseLastProjectList={handleUseLastProjectList}
        fileInputRef={fileInputRef}
        onFileInput={onFileInput}
        onRunNewCheck={handleRunNewCheck}
        onDownloadCsv={() => downloadCsv(projectsState.projects, deepCheck.deep)}
        onDownloadJson={() => downloadJson(projectsState.projects, deepCheck.deep)}
        onClearCache={() => setClearCacheModalOpen(true)}
        hasCheckResults={hasCheckResults}
        busy={busy}
      />

      {projectsState.projects.length > 0 && projectsState.fetching && <FetchOverlay />}
      {loadingRunId === '__latest__' && (
        <FetchOverlay title="Restoring last run…" description="Loading the saved snapshot from the server." />
      )}

      {projectsState.projects.length === 0 ? (
        <Dropzone
          fetching={projectsState.fetching}
          parseError={projectsState.parseError}
          onDrop={onDrop}
          onBrowseClick={() => fileInputRef.current?.click()}
          onFetchFromBerachain={handleFetchFromBerachain}
          onUseLastProjectList={handleUseLastProjectList}
          history={savedRun.history}
          historyLoading={savedRun.historyLoading}
          onLoadHistory={handleSelectHistory}
          loadingHistoryId={loadingRunId}
        />
      ) : (
        <>
          {projectsState.parseError && <p className="parse-error">{projectsState.parseError}</p>}

          {showCheckPrompt && (
            <CheckModePrompt
              projectsCount={projectsState.projects.length}
              onQuickCheck={handleStartCheck}
              onDeepCheck={handleStartDeepCheck}
              disabled={busy}
            />
          )}

          {verdictCounts && <SummaryCards variant="deep" counts={verdictCounts} />}
          {quickCounts && <SummaryCards variant="quick" counts={quickCounts} />}

          <SearchAndFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusCounts={statusCounts}
            verdictFilter={verdictFilter}
            onToggleVerdict={toggleVerdictFilter}
            onClearVerdictFilter={() => setVerdictFilter(new Set())}
          />

          <ResultsTable
            projects={sortedProjects}
            deep={deepCheck.deep}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            selectedProjectId={selectedProjectId}
            onOpenDetail={setSelectedProjectId}
            sort={sort}
            onSort={toggleSort}
          />
        </>
      )}

      {deepCheck.deepRunning && (
        <BatchProgressBar
          projects={projectsState.projects}
          deep={deepCheck.deep}
          signalProgress={deepCheck.signalProgress}
          totalSignals={deepCheck.totalSignals}
          startedAt={deepCheck.startedAt}
          statusCounts={statusCounts}
          issuesCount={issuesCount}
          onViewActivity={() => setActivityModalOpen(true)}
        />
      )}

      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          result={deepCheck.deep[selectedProject.id]}
          isFavorite={isFavorite(selectedProject.id)}
          onToggleFavorite={() => toggleFavorite(selectedProject.id)}
          onClose={() => setSelectedProjectId(null)}
        />
      )}

      {activityModalOpen && (
        <ActivityModal log={deepCheck.activityLog} onClose={() => setActivityModalOpen(false)} />
      )}

      {clearCacheModalOpen && (
        <ConfirmModal
          title="Clear check cache?"
          message="This wipes cached X, GitHub, and content-baseline results on the server, so the next check re-fetches everything from scratch — and also permanently deletes all saved run history (Restore last run / Select from history). This can't be undone."
          confirmLabel="Clear cache"
          confirming={deepCheck.clearingCache}
          onConfirm={handleConfirmClearCache}
          onCancel={() => setClearCacheModalOpen(false)}
        />
      )}

      {historyModalOpen && (
        <HistoryModal
          history={savedRun.history}
          loadingId={loadingRunId}
          onSelect={handleSelectHistory}
          onClose={() => setHistoryModalOpen(false)}
        />
      )}

      <RateLimitFooter refreshToken={deepCheck.completedAt} />
    </div>
  )
}
