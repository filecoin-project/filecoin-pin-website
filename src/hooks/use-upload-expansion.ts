import { useCallback, useEffect, useState } from 'react'
import { useUploadHistory } from '../context/upload-history-context.tsx'
import type { useUploadOrchestration } from './use-upload-orchestration.ts'

/**
 * Manages expansion state for upload history cards.
 *
 * Single Responsibility: Track which upload cards are expanded/collapsed
 *
 * Handles:
 * - Manual expansion toggling by user
 * - Auto-expansion of newly uploaded items
 * - Checking if a specific item is expanded
 *
 * Does NOT:
 * - Render UI (that's components' job)
 * - Manage upload data (that's UploadHistoryContext's job)
 * - Handle upload lifecycle (that's useUploadOrchestration's job)
 *
 * @example
 * ```tsx
 * function UploadHistoryList() {
 *   const { history } = useUploadHistory()
 *   const orchestration = useUploadOrchestration()
 *   const { isExpanded, toggleExpansion } = useUploadExpansion(orchestration)
 *
 *   return history.map(upload => (
 *     <UploadCard
 *       key={upload.id}
 *       isExpanded={isExpanded(upload.id)}
 *       onToggle={() => toggleExpansion(upload.id)}
 *       {...upload}
 *     />
 *   ))
 * }
 * ```
 */
export function useUploadExpansion(orchestration: ReturnType<typeof useUploadOrchestration>) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const { history } = useUploadHistory()
  const { pendingAutoExpandPieceCids } = orchestration

  /**
   * Auto-expand items when they appear in history.
   * This is triggered after an upload completes and transitions to history.
   *
   * The orchestration hook marks piece CIDs as "pending auto-expand",
   * and this effect expands them once they appear in the history list.
   */
  useEffect(() => {
    if (history.length === 0 || pendingAutoExpandPieceCids.size === 0) {
      return
    }

    const idsToExpand: string[] = []

    // Find history items that match pending piece CIDs
    pendingAutoExpandPieceCids.forEach((pieceCid) => {
      const piece = history.find((p) => p.pieceCid === pieceCid)
      if (piece) {
        idsToExpand.push(piece.id)
      }
    })

    // Expand the matching items
    if (idsToExpand.length > 0) {
      console.debug('[UploadExpansion] Auto-expanding items:', idsToExpand)
      setExpandedItems((prev) => {
        const next = new Set(prev)
        idsToExpand.forEach((id) => {
          next.add(id)
        })
        return next
      })

      // Clear the pending piece CIDs that we've processed
      // Note: We don't clear pendingAutoExpandPieceCids here because it's a ref
      // managed by useUploadOrchestration. It will be cleared on next upload.
    }
  }, [history, pendingAutoExpandPieceCids])

  /**
   * Toggle expansion state for a specific upload item
   */
  const toggleExpansion = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /**
   * Check if a specific upload item is expanded
   */
  const isExpanded = useCallback(
    (id: string) => {
      return expandedItems.has(id)
    },
    [expandedItems]
  )

  return {
    /**
     * Set of IDs for expanded items
     */
    expandedItems,

    /**
     * Toggle expansion state for an item
     * @param id - Unique ID of the upload item
     */
    toggleExpansion,

    /**
     * Check if an item is expanded
     * @param id - Unique ID of the upload item
     * @returns true if expanded, false if collapsed
     */
    isExpanded,
  }
}
