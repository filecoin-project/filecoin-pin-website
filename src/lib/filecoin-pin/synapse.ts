export type { Synapse } from '@filoz/synapse-sdk'

export const APPLICATION_SOURCE = 'filecoin-pin'

// Callers must validate the connected owner's session rather than a deployment key.
export const ensureSessionKeyPermissions = async (): Promise<void> => {
  throw new Error('Connect a wallet and authorize a browser session before uploading.')
}
