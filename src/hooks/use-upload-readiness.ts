import { useBrowserWallet } from '../context/browser-wallet-provider.tsx'
import { getUploadReadiness } from '../utils/upload/upload-readiness.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'

export function useUploadReadiness() {
  const connection = useBrowserWallet()
  const { wallet, synapse, storageSetup, encryption } = useFilecoinPinContext()
  return getUploadReadiness({
    sessionStatus: connection.sessionStatus,
    encryptionReady: encryption.ready,
    walletStatus: wallet.status,
    hasClient: Boolean(synapse),
    busy: connection.busy || Boolean(connection.pendingTransaction),
    storage: storageSetup,
    walletError: connection.error,
  })
}
