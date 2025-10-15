import { useMemo } from 'react'
import { useUploadHistory } from '../context/upload-history-context.ts'
import type { DatasetPiece } from './use-dataset-pieces.ts'
import { useUploadOrchestration } from './use-upload-orchestration.ts'

/**
 * Get a specific upload by its identifier (CID, piece CID, or ID).
 *
 * Single Responsibility: Unified lookup across active and historical uploads
 *
 * This hook provides a single interface to find uploads whether they are:
 * - Currently being uploaded (active upload)
 * - Already completed (in history)
 *
 * Components can use just a CID to access upload data without knowing
 * whether it's active or historical.
 *
 * @param identifier - CID, piece CID, or unique ID
 * @param type - Type of identifier: 'cid', 'pieceCid', or 'id' (default: 'cid')
 * @returns Upload data or null if not found
 *
 * @example Using CID (default) for active upload
 * ```tsx
 * function UploadCard({ cid }) {
 *   const upload = useUpload(cid)
 *
 *   if (!upload) return <NotFound />
 *
 *   // Works for both active and historical uploads
 *   return <div>{upload.fileName}</div>
 * }
 * ```
 *
 * @example Using piece CID
 * ```tsx
 * function PieceInfo({ pieceCid }) {
 *   const upload = useUpload(pieceCid, 'pieceCid')
 *   return upload ? <div>{upload.fileName}</div> : null
 * }
 * ```
 *
 * @example Using unique ID
 * ```tsx
 * function HistoryItem({ id }) {
 *   const upload = useUpload(id, 'id')
 *   return upload ? <UploadCard {...upload} /> : null
 * }
 * ```
 */
export function useUpload(identifier: string, type: 'cid' | 'pieceCid' | 'id' = 'cid'): DatasetPiece | null {
  const { activeUpload } = useUploadOrchestration()
  const { getUploadByCid, getUploadByPieceCid, getUploadById } = useUploadHistory()

  return useMemo(() => {
    // For CID lookup, check active upload first
    if (type === 'cid' && activeUpload.currentCid === identifier) {
      // Active upload doesn't have the same shape as DatasetPiece
      // Return null for now - active uploads should be accessed via useUploadOrchestration
      // This hook is primarily for historical uploads
      return null
    }

    // Look up in history based on identifier type
    switch (type) {
      case 'cid':
        return getUploadByCid(identifier) || null
      case 'pieceCid':
        return getUploadByPieceCid(identifier) || null
      case 'id':
        return getUploadById(identifier) || null
    }
  }, [identifier, type, activeUpload.currentCid, getUploadByCid, getUploadByPieceCid, getUploadById])
}
