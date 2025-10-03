import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, polygon, arbitrum } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

const filecoinCalibration = defineChain({
  id: 314159,
  name: 'Filecoin Calibration',
  nativeCurrency: {
    decimals: 18,
    name: 'Testnet Filecoin',
    symbol: 'TFIL',
  },
  rpcUrls: {
    default: {
      http: ['https://api.calibration.node.glif.io/rpc/v1'],
    },
    public: {
      http: ['https://api.calibration.node.glif.io/rpc/v1'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Filscan',
      url: 'https://calibration.filscan.io',
    },
  },
  testnet: true,
})

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

export const config = createConfig({
  chains: [filecoinCalibration, mainnet, sepolia, polygon, arbitrum],
  connectors: [
    injected(),
    metaMask(),
    ...(projectId ? [walletConnect({
      projectId,
    })] : []),
  ],
  transports: {
    [filecoinCalibration.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
