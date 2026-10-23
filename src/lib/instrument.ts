import * as Sentry from '@sentry/react'
import { configureTelemetry } from 'filecoin-pin/core/telemetry'

configureTelemetry({ affordance: 'pin.filecoin.cloud' })

Sentry.init({
  dsn: 'https://PH2VByCrdrU9fmwjQe13KuuZ@s1682007.us-east-9.betterstackdata.com/1682007',
  // Setting this option to false will prevent the SDK from sending default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: false,
  // Enable tracing/performance monitoring
  tracesSampleRate: 1.0, // Capture 100% of transactions for development (adjust in production)
})

Sentry.setTags({
  synapseSdkVersion: `@filoz/synapse-sdk@v${__SYNAPSE_SDK_VERSION__}`,
})
