import type { useUploadOrchestration } from './use-upload-orchestration.ts'

/**
 * Derives UI display state from upload orchestration.
 *
 * Single Responsibility: Determine what UI components to show
 *
 * Pure derivation - no side effects, no orchestration, no business logic.
 * Just answers the question: "What should be visible on screen?"
 *
 * @example
 * ```tsx
 * function Content() {
 *   const orchestration = useUploadOrchestration()
 *   const { showUploadForm, showActiveUpload, isUploading } = useUploadUI(orchestration)
 *
 *   return (
 *     <>
 *       {showUploadForm && <DragNDrop />}
 *       {showActiveUpload && <UploadProgress />}
 *       {isUploading && <LoadingSpinner />}
 *     </>
 *   )
 * }
 * ```
 */
export function useUploadUI(orchestration: ReturnType<typeof useUploadOrchestration>) {
  const { uploadedFile, activeUpload } = orchestration

  return {
    /**
     * Whether to show the upload form.
     * True when no file is currently being uploaded.
     */
    showUploadForm: !uploadedFile,

    /**
     * Whether to show the active upload progress view.
     * True when a file is currently being uploaded.
     */
    showActiveUpload: Boolean(uploadedFile),

    /**
     * Whether an upload is currently in progress.
     * True during the active upload process (not during indexing/waiting).
     */
    isUploading: activeUpload.isUploading,
  }
}
