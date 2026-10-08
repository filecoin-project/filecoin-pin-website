import type { FilecoinChain } from '@filoz/synapse-core/chains'
import { asClient } from '@filoz/synapse-core/client'
import { DefaultFwssPermissions, fromSecp256k1 } from '@filoz/synapse-core/session-key'
import { calibration, mainnet, Synapse } from '@filoz/synapse-sdk'
import {
  type Address,
  createClient,
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  http,
} from 'viem'
import type { BrowserSession } from '../local-storage/session-vault.ts'

export type DriveNetwork = 'mainnet' | 'calibration'
export const chains = { mainnet, calibration }
export const UPLOAD_PERMISSIONS = DefaultFwssPermissions
export class SessionPermissionError extends Error {
  constructor() {
    super('Upload session expired or was revoked. Authorize it again.')
    this.name = 'SessionPermissionError'
  }
}
export const scopeFor = (address: string, network: DriveNetwork) => `${chains[network].id}:${address.toLowerCase()}`

export function ownerClient(provider: EIP1193Provider, address: Address, network: DriveNetwork) {
  return createWalletClient({ account: address, chain: chains[network], transport: custom(provider) })
}

export function publicClient(network: DriveNetwork) {
  return createPublicClient({ chain: chains[network], transport: http(), pollingInterval: 15_000 })
}

export function browserSynapse(
  address: Address,
  network: DriveNetwork,
  session: BrowserSession | null,
  chain: FilecoinChain = chains[network]
) {
  const client = asClient(createClient({ account: address, chain, transport: http(), pollingInterval: 15_000 }))
  const key = session
    ? fromSecp256k1({ root: address, privateKey: session.privateKey, chain, transport: http() })
    : null
  const synapse = new Synapse({
    client,
    ...(key ? { sessionClient: key.client } : {}),
    source: 'filecoin-pin',
    withCDN: false,
  })
  const validate = async () => {
    if (!key) throw new Error('Authorize an upload session first.')
    await key.syncExpirations(UPLOAD_PERMISSIONS)
    if (!key.hasPermissions(UPLOAD_PERMISSIONS)) throw new SessionPermissionError()
  }
  return {
    synapse,
    validate,
    expiresAt: () =>
      key
        ? Number(
            UPLOAD_PERMISSIONS.reduce(
              (minimum, permission) => (key.expirations[permission] < minimum ? key.expirations[permission] : minimum),
              key.expirations[UPLOAD_PERMISSIONS[0]]
            )
          )
        : 0,
  }
}
