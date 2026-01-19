import './lib/instrument.ts'
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Toaster } from 'sonner'
import App from './app.tsx'
import { BreakpointDebugger } from './components/ui/breakpoint-debugger.tsx'
import { FilecoinPinProvider } from './context/filecoin-pin-provider.tsx'
import { UploadHistoryProvider } from './context/upload-history-context.tsx'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

createRoot(root, {
  // Callback called when an error is thrown and not caught by an ErrorBoundary.
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn('Uncaught error', error, errorInfo.componentStack);
  }),
  // Callback called when React catches an error in an ErrorBoundary.
  onCaughtError: Sentry.reactErrorHandler(),
  // Callback called when React automatically recovers from errors.
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <FilecoinPinProvider>
      <UploadHistoryProvider>
        <Toaster mobileOffset={0} offset={0} position="bottom-right" />
        <App />
        {import.meta.env.DEV && <BreakpointDebugger />}
      </UploadHistoryProvider>
    </FilecoinPinProvider>
  </StrictMode>
)
