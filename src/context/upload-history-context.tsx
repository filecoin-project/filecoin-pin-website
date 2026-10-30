import { createContext, type ReactNode, useContext, useMemo } from 'react'
import type { DatasetPiece, DirectoryPiecePatch, PieceMutation } from '../hooks/use-dataset-pieces.ts'
import { useDatasetPieces } from '../hooks/use-dataset-pieces.ts'

export interface UploadHistoryContextValue {
  /**
   * All completed uploads for the current dataset
   */
  history: DatasetPiece[]
  updateUpload: (id: string, patch: DirectoryPiecePatch) => Promise<void>
  mutateHistory: (update: PieceMutation) => Promise<void>
  getLatestHistory: () => DatasetPiece[]
  hasUnsavedChanges: boolean

  /**
   * Refresh the upload history from the backend
   */
  refreshHistory: () => void

  /**
   * Add a new upload to history without refetching from backend
   */
  addUpload: (piece: DatasetPiece) => Promise<void>

  /**
   * Loading state for history fetching
   */
  isLoading: boolean

  /**
   * Local directory persistence errors; index requests report indexError separately
   */
  error: string | null
  indexError: string | null

  /**
   * Indicates whether a Filecoin index load attempt has completed; cache reads do not count.
   */
  hasLoaded: boolean
}

const UploadHistoryContext = createContext<UploadHistoryContextValue | undefined>(undefined)

/**
 * Provides upload history data access to all child components.
 *
 * Single Responsibility: Historical upload data CRUD operations
 *
 * Does NOT:
 * - Handle active/in-progress uploads (that's useFilecoinUpload)
 * - Orchestrate upload lifecycle (that's useUploadOrchestration)
 * - Manage UI state (that's component state or UI hooks)
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <FilecoinPinProvider>
 *       <UploadHistoryProvider>
 *         <Content />
 *       </UploadHistoryProvider>
 *     </FilecoinPinProvider>
 *   )
 * }
 *
 * function UploadList() {
 *   const { history, refreshHistory } = useUploadHistory()
 *   return (
 *     <>
 *       <button onClick={refreshHistory}>Refresh</button>
 *       {history.map(u => <UploadCard key={u.id} cid={u.cid} />)}
 *     </>
 *   )
 * }
 * ```
 */
export function UploadHistoryProvider({ children }: { children: ReactNode }) {
  const {
    pieces,
    updatePiece,
    mutatePieces,
    getLatestPieces,
    refreshPieces,
    addPiece,
    hasUnsavedChanges,
    isLoading,
    error,
    indexError,
    hasLoaded,
  } = useDatasetPieces()

  const value = useMemo<UploadHistoryContextValue>(
    () => ({
      history: pieces,
      updateUpload: updatePiece,
      mutateHistory: mutatePieces,
      getLatestHistory: getLatestPieces,
      hasUnsavedChanges,
      refreshHistory: refreshPieces,
      addUpload: addPiece,
      isLoading,
      error,
      indexError,
      hasLoaded,
    }),
    [
      pieces,
      updatePiece,
      mutatePieces,
      getLatestPieces,
      hasUnsavedChanges,
      refreshPieces,
      addPiece,
      isLoading,
      error,
      indexError,
      hasLoaded,
    ]
  )

  return <UploadHistoryContext.Provider value={value}>{children}</UploadHistoryContext.Provider>
}

/**
 * Access the upload history context.
 *
 * Provides read access to completed uploads and refresh functionality.
 *
 * @throws Error if used outside of UploadHistoryProvider
 *
 * @example
 * ```tsx
 * function UploadList() {
 *   const { history, isLoading, refreshHistory } = useUploadHistory()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <>
 *       <button onClick={refreshHistory}>Refresh</button>
 *       {history.map(u => <div key={u.id}>{u.fileName}</div>)}
 *     </>
 *   )
 * }
 * ```
 */
export function useUploadHistory() {
  const context = useContext(UploadHistoryContext)
  if (!context) {
    throw new Error('useUploadHistory must be used within an UploadHistoryProvider')
  }
  return context
}
