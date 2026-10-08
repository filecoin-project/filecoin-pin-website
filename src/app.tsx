import { Landing } from './components/drive/landing.tsx'
import { WalletControls } from './components/drive/wallet-controls.tsx'
import Content from './components/layout/content.tsx'
import { useBrowserWallet } from './context/browser-wallet-provider.tsx'
import { FilecoinPinProvider } from './context/filecoin-pin-provider.tsx'
import { UploadHistoryProvider } from './context/upload-history-context.tsx'

const isSecureContext = typeof globalThis.crypto?.subtle !== 'undefined'

function App() {
  const connection = useBrowserWallet()
  const identity = `${connection.network}:${connection.address ?? 'disconnected'}`
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <WalletControls />
      {isSecureContext ? (
        connection.address ? (
          <FilecoinPinProvider key={identity}>
            <UploadHistoryProvider>
              <Content />
            </UploadHistoryProvider>
          </FilecoinPinProvider>
        ) : (
          <Landing />
        )
      ) : (
        <main className="p-8">
          <h2 className="text-xl">Secure context required</h2>
          <p>Open this app over HTTPS or localhost to use browser session keys.</p>
        </main>
      )}
    </div>
  )
}

export default App
