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

const APPLICATION_SOURCE = 'filecoin-pin'
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
 * Inline session-key init that bypasses `Synapse.create`'s permission check.
 *
 * The SDK's `Synapse.create` requires the session key to hold ALL four
 * `DefaultFwssPermissions` (CreateDataSet, AddPieces, SchedulePieceRemovals,
 * DeleteDataSet) at construction time. We only authorize CreateDataSet +
 * AddPieces on-chain (least privilege), so we go through the public
 * `Synapse` constructor directly.
 *
 * `syncExpirations` is narrowed to the permissions we actually grant; we
 * still validate them ourselves so a misconfigured / expired session key
 * fails fast instead of silently breaking writes later.
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

  await sessionKey.syncExpirations(REQUIRED_PERMISSIONS)
  if (!sessionKey.hasPermissions(REQUIRED_PERMISSIONS)) {
    throw new Error(
      'Session key is missing or has expired permissions for CreateDataSet and/or AddPieces. ' +
        'Re-authorize via scripts/create-session-key.sh and update VITE_SESSION_KEY.'
    )
  }

  const resolved = transport({ chain, retryCount: 0 })
  const client = createClient({
    chain,
    transport: custom({ request: resolved.request }),
    account: walletAddress,
    name: 'Synapse Client',
    key: 'synapse-client',
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
}
