import { useCallback, useRef, useState } from 'react'
import { Header } from '../shared/components/Header.jsx'
import { Dropzone } from '../shared/components/Dropzone.jsx'
import { CheckModePrompt } from '../shared/components/CheckModePrompt.jsx'
import { computeVerdictCounts, computeQuickCounts } from '../shared/domain/scoring.js'
import { useProjects } from '../features/project-source/useProjects.js'
import { useQuickCheck } from '../features/quick-check/useQuickCheck.js'
import { useDeepCheck } from '../features/deep-check/useDeepCheck.js'
import { BatchProgressBar } from '../features/deep-check/BatchProgressBar.jsx'
import { ActivityModal } from '../features/deep-check/ActivityModal.jsx'
import { SearchAndFilters } from '../features/search-filters/SearchAndFilters.jsx'
import { filterProjects, computeStatusCounts } from '../features/search-filters/filters.js'
import { ResultsTable } from '../features/results-table/ResultsTable.jsx'
import { SummaryCards } from '../features/results-table/SummaryCards.jsx'
import { ProjectDetailModal } from '../features/project-detail/ProjectDetailModal.jsx'
import { useSavedRun } from '../features/saved-runs/useSavedRun.js'
import { useFavorites } from '../features/favorites/useFavorites.js'
import { downloadCsv } from '../services/csvExportService.js'

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
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [activityModalOpen, setActivityModalOpen] = useState(false)

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

  const busy = quick.checking || deepCheck.deepRunning || projectsState.fetching

  const handleFetchFromBerachain = () => {
    if (busy) return
    projectsState.fetchFromBerachain(resetForNewLoad)
  }

  const handleStartCheck = () => {
    if (deepCheck.deepRunning) return
    quick.startCheck()
  }

  const handleStartDeepCheck = () => {
    if (quick.checking) return
    deepCheck.startDeepCheck()
  }

  const handleLoadLastRun = () => {
    const result = savedRun.loadLastRun()
    if (result.status === 'error') {
      projectsState.setParseError('Saved run is corrupted — could not load it.')
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
        onLoadLastRun={handleLoadLastRun}
        onFetchFromBerachain={handleFetchFromBerachain}
        fileInputRef={fileInputRef}
        onFileInput={onFileInput}
        onStartCheck={handleStartCheck}
        onStartDeepCheck={handleStartDeepCheck}
        onDownloadCsv={() => downloadCsv(projectsState.projects, deepCheck.deep)}
        showCheckPrompt={showCheckPrompt}
        hasCheckResults={hasCheckResults}
        busy={busy}
      />

      {projectsState.projects.length === 0 ? (
        <Dropzone
          fetching={projectsState.fetching}
          parseError={projectsState.parseError}
          onDrop={onDrop}
          onBrowseClick={() => fileInputRef.current?.click()}
          onFetchFromBerachain={handleFetchFromBerachain}
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
            projects={filteredProjects}
            deep={deepCheck.deep}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            selectedProjectId={selectedProjectId}
            onOpenDetail={setSelectedProjectId}
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
    </div>
  )
}
