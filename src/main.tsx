import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { FilecoinPinProvider } from './context/filecoin-pin-provider.tsx'
import { Toaster } from 'sonner'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <FilecoinPinProvider>
      <Toaster mobileOffset={0} offset={0} position="bottom-right" />
      <App />
    </FilecoinPinProvider>
  </StrictMode>
)
