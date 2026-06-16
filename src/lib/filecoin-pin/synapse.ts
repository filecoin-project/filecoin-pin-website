import { AddPiecesPermission, CreateDataSetPermission, fromSecp256k1 } from '@filoz/synapse-core/session-key'
import { calibration, Synapse } from '@filoz/synapse-sdk'
import { initializeSynapse, type SynapseSetupConfig } from 'filecoin-pin/core/synapse'
import pino from 'pino'
import { createClient, custom, getAddress, type HttpTransport, http, type WebSocketTransport, webSocket } from 'viem'

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

export const APPLICATION_SOURCE = 'filecoin-pin'
const WEBSOCKET_REGEX = /^ws(s)?:\/\//i

function createTransport(rpcUrl: string): HttpTransport | WebSocketTransport {
  return WEBSOCKET_REGEX.test(rpcUrl) ? webSocket(rpcUrl) : http(rpcUrl)
}

function isSessionKeyConfig(
  config: SynapseSetupConfig
): config is Extract<SynapseSetupConfig, { sessionKey: `0x${string}` }> {
  return (
    'walletAddress' in config &&
    'sessionKey' in config &&
    config.walletAddress != null &&
    config.sessionKey != null &&
    !('readOnly' in config && config.readOnly === true)
  )
}

const REQUIRED_PERMISSIONS = [CreateDataSetPermission, AddPiecesPermission]

/**
 * Session-key permission check, set during session-key init and run lazily.
 *
 * Checking permissions costs RPC calls, so it runs at upload time (the only
 * point that needs write permissions) rather than on page load. The result is
 * cached for the session; a failed check is retried on the next call.
 */
let validateSessionKey: (() => Promise<void>) | null = null
let sessionKeyValidation: Promise<void> | null = null

export const ensureSessionKeyPermissions = (): Promise<void> => {
  if (!validateSessionKey) return Promise.resolve()
  if (!sessionKeyValidation) {
    const promise = validateSessionKey()
    promise.catch(() => {
      if (sessionKeyValidation === promise) {
        sessionKeyValidation = null
      }
    })
    sessionKeyValidation = promise
  }
  return sessionKeyValidation
}

/**
 * Inline session-key init that bypasses `Synapse.create`'s permission check.
 *
 * The SDK's `Synapse.create` requires the session key to hold ALL four
 * `DefaultFwssPermissions` (CreateDataSet, AddPieces, SchedulePieceRemovals,
 * DeleteDataSet) at construction time. We only authorize CreateDataSet +
 * AddPieces on-chain (least privilege), so we go through the public
 * `Synapse` constructor directly.
 *
 * `syncExpirations` is narrowed to the permissions we actually grant. The
 * check is deferred to upload time (see `ensureSessionKeyPermissions`) so a
 * read-only page visit pays zero RPC calls for it; writes still fail fast
 * with a clear message when the session key is misconfigured / expired.
 */
async function initSessionKeySynapse(
  config: Extract<SynapseSetupConfig, { sessionKey: `0x${string}` }>
): Promise<Synapse> {
  const chain = config.chain ?? calibration
  const rpcUrl = config.rpcUrl ?? chain.rpcUrls.default.webSocket?.[0] ?? chain.rpcUrls.default.http[0]
  const transport = rpcUrl ? createTransport(rpcUrl) : http()

  const walletAddress = getAddress(config.walletAddress)

  const sessionKey = fromSecp256k1({
    privateKey: config.sessionKey,
    root: walletAddress,
    chain,
    transport,
  })

  validateSessionKey = async () => {
    await sessionKey.syncExpirations(REQUIRED_PERMISSIONS)
    if (!sessionKey.hasPermissions(REQUIRED_PERMISSIONS)) {
      throw new Error(
        'Session key is missing or has expired permissions for CreateDataSet and/or AddPieces. ' +
          'Re-authorize via scripts/create-session-key.sh and update VITE_SESSION_KEY.'
      )
    }
  }

  const resolved = transport({ chain, retryCount: 0 })
  const client = createClient({
    chain,
    transport: custom({ request: resolved.request }),
    account: walletAddress,
    name: 'Synapse Client',
    key: 'synapse-client',
    // Filecoin calibration produces a block every 30s; poll receipts at 15s
    // instead of viem's 4s default to cut polling RPC traffic.
    pollingInterval: 15_000,
  })

  logger.info(
    { event: 'synapse.init', mode: 'session-key-bypass', chain: chain.name },
    'Initializing Synapse (session key, bypassing DefaultFwssPermissions check)'
  )

  return new Synapse({
    client,
    sessionClient: sessionKey.client,
    source: APPLICATION_SOURCE,
    withCDN: config.withCDN ?? false,
  })
}

export type { Synapse }

let synapsePromise: Promise<Synapse> | null = null

export const getSynapseClient = (config: SynapseSetupConfig) => {
  if (!synapsePromise) {
    const promise = isSessionKeyConfig(config) ? initSessionKeySynapse(config) : initializeSynapse(config, logger)
    // Clear the cached rejected promise so the next caller can retry instead
    // of receiving the same stale failure forever.
    promise.catch(() => {
      if (synapsePromise === promise) {
        synapsePromise = null
      }
    })
    synapsePromise = promise
  }

  return synapsePromise
}

export const resetSynapseClient = () => {
  synapsePromise = null
  validateSessionKey = null
  sessionKeyValidation = null
}
