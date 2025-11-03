import { initializeSynapse, type SynapseService } from 'filecoin-pin/core/synapse'
import pino from 'pino'
import * as Sentry from '@sentry/browser'

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
          sentryInitOptions: {
            defaultIntegrations: false,
            integrations: [Sentry.httpClientIntegration()],
          },
          sentrySetTags: {
            appName: 'filecoinPinWebsite',
            filecoinPinWebsiteDomain: window.location.origin,
          },
        },
      },
      logger
    ).then((synapse) => {
      if (synapse.telemetry?.sentry) {
        synapse.telemetry?.sentry.disable
      }
      return synapse
    })
  }

  return synapsePromise
}

export const resetSynapseClient = () => {
  synapsePromise = null
}
