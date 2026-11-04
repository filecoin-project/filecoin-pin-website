import type { Connector } from 'wagmi'

export type WalletOption = { id: string; name: string; rdns?: string; icon?: string }
type WalletConnector = Pick<Connector, 'id' | 'uid' | 'name' | 'icon' | 'type'>

export function walletOption(connector: WalletConnector): WalletOption {
  return {
    id: connector.uid,
    name: connector.name,
    rdns: connector.id === 'injected' ? undefined : connector.id,
    icon: connector.icon,
  }
}

/** The picker lists named EIP-6963 wallets; legacy injection stays out of the UI. */
export function installedWalletOptions(connectors: readonly WalletConnector[]) {
  return connectors
    .filter((connector) => connector.type === 'injected' && connector.id !== 'injected')
    .map(walletOption)
}
