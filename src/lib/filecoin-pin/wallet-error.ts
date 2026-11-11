type ErrorDetails = { message?: unknown; shortMessage?: unknown; details?: unknown; code?: unknown; cause?: unknown }

/** Keep wallet-provided detail even when an SDK wraps it in a generic error. */
export function describeWalletError(cause: unknown): string {
  const messages: string[] = []
  const seen = new Set<unknown>()
  let current = cause
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const error = current as ErrorDetails
    for (const value of [error.shortMessage ?? error.message, error.details]) {
      if (typeof value === 'string' && value.trim() && !messages.includes(value.trim())) messages.push(value.trim())
    }
    if (typeof error.code === 'number' && !messages.includes(`Code: ${error.code}`))
      messages.push(`Code: ${error.code}`)
    current = error.cause
  }
  if (!messages.length && typeof cause === 'string') messages.push(cause)
  return messages.join(' · ') || 'The wallet did not provide an error message.'
}

export class WalletConnectionError extends Error {
  constructor(wallet: string, network: string, stage: 'connect' | 'switch network', cause: unknown) {
    super(
      `${wallet}: unable to ${stage === 'connect' ? 'connect the wallet' : 'switch the wallet'} for ${network}. ${describeWalletError(cause)}`,
      { cause }
    )
    this.name = 'WalletConnectionError'
  }
}
