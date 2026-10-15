import { type Address, getAddress, isAddress } from 'viem'
import { chains, type DriveNetwork } from './browser-wallet.ts'
import type { WalletConnectProvider } from './wallet-connect.ts'

/** Session namespaces bind each account to its explicitly approved chain. */
export function walletConnectSessionAccount(
  provider: WalletConnectProvider,
  network: DriveNetwork
): Address | undefined {
  const prefix = `eip155:${chains[network].id}:`
  const account = Object.values(provider.session?.namespaces ?? {})
    .flatMap((namespace) => namespace.accounts ?? [])
    .find((value) => value.startsWith(prefix) && isAddress(value.slice(prefix.length)))
  return account ? getAddress(account.slice(prefix.length)) : undefined
}

/** Mobile wallets may publish their account update after the pairing settles. */
export async function readWalletConnectAccount(
  provider: WalletConnectProvider,
  network: DriveNetwork
): Promise<Address> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await provider.request({ method: 'eth_accounts' })
    const account = Array.isArray(result)
      ? result.find((value) => typeof value === 'string' && isAddress(value))
      : undefined
    if (account) return getAddress(account)
    // Use only an account explicitly approved for the selected chain. Never
    // borrow an address from another chain to make an incomplete pairing pass.
    const approved = walletConnectSessionAccount(provider, network)
    if (approved) return approved
    if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const approvedChains = [
    ...new Set(
      Object.values(provider.session?.namespaces ?? {}).flatMap((namespace) =>
        (namespace.accounts ?? []).map((account) => account.split(':').slice(0, 2).join(':'))
      )
    ),
  ]
  console.warn('[WalletConnect] No account approved for selected network', {
    selectedChain: `eip155:${chains[network].id}`,
    approvedChains,
  })
  throw new Error(
    `Your mobile wallet did not provide an account for ${chains[network].name}. Add and enable this network in the wallet, then reconnect and approve it.`
  )
}
