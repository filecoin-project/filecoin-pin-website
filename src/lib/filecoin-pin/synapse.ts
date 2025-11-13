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
  if (!synapsePromise) {
    synapsePromise = initializeSynapse(
      {
        ...config,
        telemetry: {
          sentrySetTags: {
            appName: 'filecoinPinWebsite',
            filecoinPinWebsiteDomain: window.location.origin,
          },
        },
      },
      logger
    )
  }

  return synapsePromise
}

export const resetSynapseClient = () => {
  synapsePromise = null
}
