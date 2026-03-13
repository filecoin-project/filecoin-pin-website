import { initializeSynapse } from 'filecoin-pin/core/synapse'
import pino from 'pino'

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'

/**
 * Synapse type derived from filecoin-pin's re-export to avoid dual-copy
 * type incompatibility between the website's and filecoin-pin's
 * @filoz/synapse-sdk installations.
 */
export type Synapse = Awaited<ReturnType<typeof initializeSynapse>>

let synapsePromise: Promise<Synapse> | null = null

export const getSynapseClient = (config: SynapseSetupConfig) => {
  if (!synapsePromise) {
    synapsePromise = initializeSynapse(config, logger)
  }

  return synapsePromise
}

export const resetSynapseClient = () => {
  synapsePromise = null
}
