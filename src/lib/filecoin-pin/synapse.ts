import { RPC_URLS } from '@filoz/synapse-sdk'
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

// Timeout for WebSocket initialization (5 seconds)
const WEBSOCKET_TIMEOUT_MS = 5000

// Check if URL is a WebSocket URL
const isWebSocketUrl = (url: string | undefined): boolean => {
  if (!url) return false
  return url.startsWith('wss://') || url.startsWith('ws://')
}

// Get HTTP RPC URL from SDK (using calibration network)
const getHttpRpcUrl = (): string => {
  return RPC_URLS.calibration.http
}

// Initialize synapse with timeout
const initializeSynapseWithTimeout = async (
  config: SynapseSetupConfig,
  timeoutMs: number
): Promise<SynapseService['synapse']> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Synapse initialization timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  return Promise.race([initializeSynapse(config, logger), timeoutPromise])
}

export const getSynapseClient = async (config: SynapseSetupConfig): Promise<SynapseService['synapse']> => {
  if (!synapsePromise) {
    synapsePromise = (async () => {
      const baseConfig = {
        ...config,
        telemetry: {
          sentrySetTags: {
            appName: 'filecoinPinWebsite',
            filecoinPinWebsiteDomain: window.location.origin,
          },
        },
      }

      // If using WebSocket URL, try with timeout and fallback to HTTP
      if (isWebSocketUrl(config.rpcUrl)) {
        try {
          // Try with timeout
          return await initializeSynapseWithTimeout(baseConfig, WEBSOCKET_TIMEOUT_MS)
        } catch (error) {
          logger.warn(
            { error },
            `WebSocket RPC URL initialization timed out or failed, falling back to HTTP: ${error instanceof Error ? error.message : String(error)}`
          )

          // Fallback to HTTP URL from SDK (calibration network)
          const httpRpcUrl = getHttpRpcUrl()
          const httpConfig = {
            ...baseConfig,
            rpcUrl: httpRpcUrl,
          }

          console.log(`Retrying with HTTP RPC URL: ${httpRpcUrl}`)
          return await initializeSynapse(httpConfig, logger)
        }
      }

      // For non-WebSocket URLs, initialize normally
      return await initializeSynapse(baseConfig, logger)
    })()
  }

  return synapsePromise
}

export const resetSynapseClient = () => {
  synapsePromise = null
}
