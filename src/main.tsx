import './lib/instrument.ts'
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Toaster } from 'sonner'
import App from './app.tsx'
import { BrowserWalletProvider } from './context/browser-wallet-provider.tsx'
import { ThemeProvider, useTheme } from './context/theme-provider.tsx'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster mobileOffset={0} offset={0} position="bottom-right" theme={theme} />
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

createRoot(root, {
  // Callback called when an error is thrown and not caught by an ErrorBoundary.
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn('Uncaught error', error, errorInfo.componentStack)
  }),
  // Callback called when React catches an error in an ErrorBoundary.
  onCaughtError: Sentry.reactErrorHandler(),
  // Callback called when React automatically recovers from errors.
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserWalletProvider>
        <App />
        <ThemedToaster />
      </BrowserWalletProvider>
    </ThemeProvider>
  </StrictMode>
)
