export type FileAccessAction = 'download' | 'preview' | 'share'

/** Wallet libraries wrap EIP-1193 errors; preserve network and unknown failures. */
export function isWalletRequestCancelled(error: unknown): boolean {
  const seen = new Set<object>()
  let current = error
  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const candidate = current as { code?: unknown; name?: unknown; cause?: unknown }
    if (candidate.code === 4001 || candidate.name === 'UserRejectedRequestError') return true
    current = candidate.cause
  }
  return false
}

export function describeFileAccessError(error: unknown, action: FileAccessAction) {
  const cancelled = isWalletRequestCancelled(error)
  const messages: Record<FileAccessAction, string> = {
    download: 'Download cancelled. Sign with your wallet to decrypt this upload.',
    preview: 'Preview cancelled. Sign with your wallet to open this upload.',
    share: 'Sharing cancelled. Sign with your wallet to create a share link.',
  }
  return {
    cancelled,
    message: cancelled ? messages[action] : error instanceof Error ? error.message : `Unable to ${action} this upload.`,
  }
}
