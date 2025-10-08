import { initializeSynapse, type SynapseService } from 'filecoin-pin/core/synapse'
import pino from 'pino'

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'

let synapsePromise: Promise<SynapseService['synapse']> | null = null

export const getSynapseClient = (config: SynapseSetupConfig) => {
  if (!config.privateKey) {
    return Promise.reject(new Error('Missing VITE_FILECOIN_PRIVATE_KEY; unable to initialize Synapse'))
  }

  if (!synapsePromise) {
    synapsePromise = initializeSynapse(config, logger)
  }

  return synapsePromise
}

export const resetSynapseClient = () => {
  synapsePromise = null
}
