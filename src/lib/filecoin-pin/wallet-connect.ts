import type { EIP1193Provider } from 'viem'
import { chains, type DriveNetwork } from './browser-wallet.ts'

export type BrowserProvider = EIP1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
  disconnect?: () => Promise<void>
}

export type WalletConnectProvider = BrowserProvider & {
  accounts: string[]
  session?: { namespaces?: Record<string, { accounts?: string[]; chains?: string[] }> }
  modal?: { setThemeMode: (theme: 'light' | 'dark') => void }
  connect: (options: { chains: number[]; optionalChains: number[] }) => Promise<void>
}

// Public Reown project ID registered by Beck; deployments may override it.
const DEFAULT_WALLETCONNECT_PROJECT_ID = '6d8b88b03b08df309b5258ff3de372be'
const configuredProjectId = () =>
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || DEFAULT_WALLETCONNECT_PROJECT_ID
export const walletConnectAvailable = Boolean(configuredProjectId())
const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
let initialization: Promise<WalletConnectProvider> | undefined

// Load the relay and QR modal only when requested; injected wallets need neither.
export async function getWalletConnectProvider(network: DriveNetwork = 'mainnet'): Promise<WalletConnectProvider> {
  const projectId = configuredProjectId()
  if (!initialization) {
    initialization = import('@walletconnect/ethereum-provider')
      .then(({ EthereumProvider }) =>
        EthereumProvider.init({
          projectId,
          chains: [chains[network].id],
          optionalChains: [chains.mainnet.id, chains.calibration.id],
          showQrModal: true,
          qrModalOptions: { themeMode: currentTheme() },
          rpcMap: {
            [chains.mainnet.id]: chains.mainnet.rpcUrls.default.http[0],
            [chains.calibration.id]: chains.calibration.rpcUrls.default.http[0],
          },
          metadata: {
            name: 'Filecoin Drive',
            description: 'Upload, download and manage files on Filecoin with your wallet.',
            url: window.location.origin,
            icons: [new URL('/filecoin-mark.svg', window.location.origin).href],
          },
        })
      )
      .then((provider) => provider as unknown as WalletConnectProvider)
      .catch((error) => {
        initialization = undefined
        throw error
      })
  }
  return initialization
}

export async function connectWalletConnect(network: DriveNetwork): Promise<WalletConnectProvider> {
  const provider = await getWalletConnectProvider(network)
  provider.modal?.setThemeMode(currentTheme())
  if (!provider.session)
    await provider.connect({
      chains: [chains[network].id],
      optionalChains: [chains[network === 'mainnet' ? 'calibration' : 'mainnet'].id],
    })
  return provider
}
