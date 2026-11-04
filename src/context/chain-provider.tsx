import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { createConfig, http, WagmiProvider } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { chains } from '../lib/filecoin-pin/browser-wallet.ts'

/** One cache and connector registry per mounted application. */
export function ChainProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false, staleTime: 15_000 } },
      })
  )
  const [config] = useState(() =>
    createConfig({
      chains: [chains.mainnet, chains.calibration],
      connectors: [
        injected({
          shimDisconnect: false,
          target: { id: 'injected', name: 'Browser wallet', provider: (window) => window?.ethereum },
        }),
      ],
      transports: { [chains.mainnet.id]: http(), [chains.calibration.id]: http() },
    })
  )
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
