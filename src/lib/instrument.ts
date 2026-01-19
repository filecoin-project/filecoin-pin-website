import * as Sentry from '@sentry/react'
import packageLock from '../../package-lock.json' with { type: 'json'} 

Sentry.init({
  dsn: 'https://PH2VByCrdrU9fmwjQe13KuuZ@s1682007.us-east-9.betterstackdata.com/1682007',
  // Setting this option to false will prevent the SDK from sending default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: false,
  // Enable tracing/performance monitoring
  tracesSampleRate: 1.0, // Capture 100% of transactions for development (adjust in production)
})

Sentry.setTags({
  synapseSdkVersion: `@filoz/synapse-sdk@v${packageLock.packages['node_modules/@filoz/synapse-sdk'].version}`,
})
