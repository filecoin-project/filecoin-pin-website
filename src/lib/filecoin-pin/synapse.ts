import { Synapse } from '@filoz/synapse-sdk'
import { BrowserProvider } from 'ethers'
import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'
import { initializeSynapse, type SynapseService } from 'filecoin-pin/core/synapse'
import pino from 'pino'

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

let synapsePromise: Promise<SynapseService['synapse']> | null = null

/**
 * Get Synapse client with private key configuration
 */
export const getSynapseClientWithPrivateKey = (config: SynapseSetupConfig) => {
  if (!config.privateKey) {
    return Promise.reject(new Error('Missing VITE_FILECOIN_PRIVATE_KEY; unable to initialize Synapse'))
  }

  if (!synapsePromise) {
    synapsePromise = initializeSynapse(config, logger)
  }

  return synapsePromise
}

/**
 * Get Synapse client with browser wallet (MetaMask, etc.)
 */
export const getSynapseClientWithWallet = async (config?: Partial<SynapseSetupConfig>) => {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No browser wallet detected. Please install MetaMask or another Web3 wallet.')
  }

  logger.info('Requesting wallet connection...')

  // Request account access
  await window.ethereum.request({ method: 'eth_requestAccounts' })

  // Create ethers provider from browser wallet
  const provider = new BrowserProvider(window.ethereum)

  if (!synapsePromise) {
    logger.info('Initializing Synapse with wallet provider')

    // Use Synapse SDK directly with provider (bypassing filecoin-pin wrapper)
    // The filecoin-pin wrapper doesn't expose the provider option
    synapsePromise = Synapse.create({
      provider,
      warmStorageAddress: config?.warmStorageAddress,
    })
  }

  return synapsePromise
}

/**
 * Get Synapse client - tries private key first, then falls back to wallet
 */
export const getSynapseClient = async (config: Partial<SynapseSetupConfig>) => {
  // Try private key first if available
  if (config.privateKey) {
    logger.info('Initializing Synapse with private key')
    return getSynapseClientWithPrivateKey(config as SynapseSetupConfig)
  }

  // Fall back to browser wallet
  logger.info('No private key found, attempting wallet connection')
  return getSynapseClientWithWallet(config)
}

export const resetSynapseClient = () => {
  synapsePromise = null
}

/**
 * Disconnect wallet and clear synapse client
 * Note: MetaMask doesn't provide a programmatic disconnect API.
 * This clears our internal state. Users must manually disconnect in MetaMask
 * if they want to fully revoke permissions.
 */
export const disconnectWallet = async () => {
  logger.info('Disconnecting wallet and clearing Synapse client')

  // Clear synapse client
  resetSynapseClient()

  // Note: There's no standard way to programmatically disconnect from MetaMask
  // The user needs to disconnect manually in their wallet extension
  logger.info('Wallet state cleared. To fully disconnect, please disconnect in your wallet extension.')
}
