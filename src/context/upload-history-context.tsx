import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react'
import type { DatasetPiece } from '../hooks/use-dataset-pieces.ts'
import { useDatasetPieces } from '../hooks/use-dataset-pieces.ts'

export interface UploadHistoryContextValue {
  /**
   * All completed uploads for the current dataset
   */
  history: DatasetPiece[]

  /**
   * Get a specific upload by its CID
   */
  getUploadByCid: (cid: string) => DatasetPiece | undefined

  /**
   * Get a specific upload by its piece CID
   */
  getUploadByPieceCid: (pieceCid: string) => DatasetPiece | undefined

  /**
   * Get a specific upload by its unique ID
   */
  getUploadById: (id: string) => DatasetPiece | undefined

  /**
   * Refresh the upload history from the backend
   */
  refreshHistory: () => void

  /**
   * Add a new upload to history without refetching from backend
   */
  addUpload: (piece: DatasetPiece) => void

  /**
   * Loading state for history fetching
   */
  isLoading: boolean

  /**
   * Error state for history fetching
   */
  error: string | null

  /**
   * Indicates whether we've completed at least one history load attempt.
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
  const { pieces, refreshPieces, addPiece, isLoading, error, hasLoaded } = useDatasetPieces()

  const getUploadByCid = useCallback(
    (cid: string) => {
      return pieces.find((p) => p.cid === cid)
    },
    [pieces]
  )

  const getUploadByPieceCid = useCallback(
    (pieceCid: string) => {
      return pieces.find((p) => p.pieceCid === pieceCid)
    },
    [pieces]
  )

  const getUploadById = useCallback(
    (id: string) => {
      return pieces.find((p) => p.id === id)
    },
    [pieces]
  )

  const value = useMemo<UploadHistoryContextValue>(
    () => ({
      history: pieces,
      getUploadByCid,
      getUploadByPieceCid,
      getUploadById,
      refreshHistory: refreshPieces,
      addUpload: addPiece,
      isLoading,
      error,
      hasLoaded,
    }),
    [pieces, getUploadByCid, getUploadByPieceCid, getUploadById, refreshPieces, addPiece, isLoading, error, hasLoaded]
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
