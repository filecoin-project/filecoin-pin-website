import * as Sentry from '@sentry/react'
import { configureTelemetry } from 'filecoin-pin/core/telemetry'
import packageLock from '../../package-lock.json' with { type: 'json' }

configureTelemetry({ affordance: 'pin.filecoin.cloud' })

Sentry.init({
  dsn: 'https://PH2VByCrdrU9fmwjQe13KuuZ@s1682007.us-east-9.betterstackdata.com/1682007',
  // v11 collects these by default; keep them off
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
  // Enable tracing/performance monitoring
  tracesSampleRate: 1.0, // Capture 100% of transactions for development (adjust in production)
})

const packages = packageLock.packages as Record<string, { version?: string }>
const synapseSdkVersion = packages['node_modules/@filoz/synapse-sdk']?.version
if (synapseSdkVersion) {
  Sentry.setTags({
    synapseSdkVersion: `@filoz/synapse-sdk@v${synapseSdkVersion}`,
  })
}
