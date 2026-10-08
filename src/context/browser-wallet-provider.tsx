import { asClient } from '@filoz/synapse-core/client'
import { loginCall, revokeCall } from '@filoz/synapse-core/session-key'
import { Synapse } from '@filoz/synapse-sdk'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { type Address, getAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  browserSynapse,
  chains,
  type DriveNetwork,
  ownerClient,
  publicClient,
  SessionPermissionError,
  scopeFor,
  UPLOAD_PERMISSIONS,
} from '../lib/filecoin-pin/browser-wallet.ts'
import { DEFAULT_NETWORK } from '../lib/filecoin-pin/config.ts'
import {
  type BrowserProvider,
  connectWalletConnect,
  type WalletConnectProvider,
  walletConnectAvailable,
} from '../lib/filecoin-pin/wallet-connect.ts'
import { readWalletConnectAccount } from '../lib/filecoin-pin/wallet-connect-accounts.ts'
import { type BrowserSession, loadBrowserSession, saveBrowserSession } from '../lib/local-storage/session-vault.ts'

type InjectedProvider = BrowserProvider
type WalletOption = { id: string; name: string; provider: InjectedProvider }
interface WalletConnection {
  address: Address | null
  network: DriveNetwork
  session: BrowserSession | null
  sessionStatus: 'none' | 'checking' | 'active' | 'inactive'
  busy: boolean
  uploading: boolean
  error: string | null
  options: WalletOption[]
  connect: (id?: string) => Promise<void>
  connectWalletConnect: () => Promise<void>
  walletConnectAvailable: boolean
  disconnect: () => Promise<void>
  switchNetwork: (network: DriveNetwork) => Promise<void>
  authorize: (days: number) => Promise<void>
  revoke: () => Promise<void>
  paymentAction: (action: (synapse: Synapse) => Promise<unknown>) => Promise<void>
  setUploading: (uploading: boolean) => void
}
const Context = createContext<WalletConnection | null>(null)

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null)
  const [network, setNetwork] = useState<DriveNetwork>(DEFAULT_NETWORK)
  const [session, setSession] = useState<BrowserSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<WalletConnection['sessionStatus']>('none')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<WalletOption[]>([])
  const [provider, setProvider] = useState<InjectedProvider | null>(null)
  const identity = useRef('')
  identity.current = address ? scopeFor(address, network) : ''
  const locked = useRef(false)
  locked.current = busy || uploading
  const deferredAccount = useRef<Address | null | undefined>(undefined)

  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: InjectedProvider }>).detail
      setOptions((current) =>
        current.some((item) => item.id === detail.info.uuid)
          ? current
          : [...current, { id: detail.info.uuid, name: detail.info.name, provider: detail.provider }]
      )
    }
    window.addEventListener('eip6963:announceProvider', announce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    const injected = (window as Window & { ethereum?: InjectedProvider }).ethereum
    if (injected)
      setOptions((current) =>
        current.length ? current : [{ id: 'injected', name: 'Browser wallet', provider: injected }]
      )
    return () => window.removeEventListener('eip6963:announceProvider', announce)
  }, [])

  useEffect(() => {
    setSession(null)
    if (!address) return
    let cancelled = false
    loadBrowserSession(scopeFor(address, network))
      .then((value) => {
        if (!cancelled) setSession(value)
      })
      .catch(() => {
        if (!cancelled) setError('Unable to restore the upload session. Browser storage must be available.')
      })
    return () => {
      cancelled = true
    }
  }, [address, network])

  useEffect(() => {
    if (!address || !session) {
      setSessionStatus('none')
      return
    }
    let cancelled = false
    setSessionStatus('checking')
    // Owner transactions can change these expirations. Validate only after the
    // transaction settles so an old chain read cannot overwrite the new grant.
    if (busy) return
    const runtime = browserSynapse(address, network, session)
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryDelay = 5000
    const retryMessage = 'Unable to verify your storage session. Retrying chain reads…'
    const verify = () =>
      runtime
        .validate()
        .then(() => {
          if (!cancelled) {
            setSessionStatus('active')
            setError((previous) => (previous === retryMessage ? null : previous))
            const expiresAt = runtime.expiresAt()
            if (expiresAt !== session.expiresAt) {
              const verified = { ...session, expiresAt }
              setSession(verified)
              void saveBrowserSession(scopeFor(address, network), verified).catch(() =>
                setError('Unable to save the verified session expiry.')
              )
            }
          }
        })
        .catch((cause) => {
          if (cancelled) return
          if (cause instanceof SessionPermissionError) {
            setSessionStatus('inactive')
            setError((previous) => (previous === retryMessage ? null : previous))
          } else {
            // A failed RPC read does not prove revocation. Keep mutations blocked,
            // and recover without asking the owner to buy another authorization.
            setError((previous) => previous ?? retryMessage)
            retryTimer = setTimeout(() => {
              void verify()
            }, retryDelay)
            retryDelay = Math.min(retryDelay * 2, 30000)
          }
        })
    void verify()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [address, network, session, busy])

  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => {
      if (session.expiresAt <= Date.now() / 1000) setSessionStatus('inactive')
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session])

  useEffect(() => {
    if (!provider) return
    const accountsChanged = (value: unknown) => {
      const next = Array.isArray(value) && typeof value[0] === 'string' ? getAddress(value[0]) : null
      if (locked.current) {
        deferredAccount.current = next
        setError(
          'Your wallet changed accounts. The current operation remains attached to its original wallet; the view switches when it finishes.'
        )
      } else {
        setSession(null)
        setAddress(next)
      }
    }
    provider.on?.('accountsChanged', accountsChanged)
    const disconnected = () => {
      accountsChanged([])
      setProvider(null)
    }
    provider.on?.('disconnect', disconnected)
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged)
      provider.removeListener?.('disconnect', disconnected)
    }
  }, [provider])

  useEffect(() => {
    if (!busy && !uploading && deferredAccount.current !== undefined) {
      setSession(null)
      setAddress(deferredAccount.current)
      deferredAccount.current = undefined
    }
  }, [busy, uploading])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (locked.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const selectChain = useCallback(async (wallet: InjectedProvider, target: DriveNetwork) => {
    const chain = chains[target]
    try {
      await wallet.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chain.id.toString(16)}` }],
      })
    } catch (cause) {
      if ((cause as { code?: number }).code !== 4902) throw cause
      await wallet.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${chain.id.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: [chain.blockExplorers?.default.url ?? 'https://filecoin.blockscout.com'],
          },
        ],
      })
      await wallet.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chain.id.toString(16)}` }],
      })
    }
  }, [])

  const run = async (action: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet operation failed')
    } finally {
      setBusy(false)
      locked.current = uploading
    }
  }
  const requireOwner = async () => {
    if (!provider || !address) throw new Error('Connect a wallet first.')
    await selectChain(provider, network)
    const account = (provider as Partial<WalletConnectProvider>).session
      ? await readWalletConnectAccount(provider as WalletConnectProvider, network)
      : (await provider.request({ method: 'eth_accounts' }))[0]
    if (account?.toLowerCase() !== address.toLowerCase())
      throw new Error('Wallet account changed. Reconnect before signing.')
    return ownerClient(provider, address, network)
  }

  return (
    <Context.Provider
      value={{
        address,
        network,
        session,
        sessionStatus,
        busy,
        uploading,
        error,
        options,
        walletConnectAvailable,
        setUploading: (value) => {
          locked.current = value || busy
          setUploading(value)
        },
        connect: (id) =>
          run(async () => {
            const option = options.find((item) => item.id === id) ?? options[0]
            if (!option) throw new Error('Install an Ethereum-compatible browser wallet to connect.')
            const accounts = await option.provider.request({ method: 'eth_requestAccounts' })
            if (!accounts[0]) throw new Error('No wallet account selected')
            await selectChain(option.provider, network)
            setProvider(option.provider)
            setAddress(getAddress(accounts[0]))
          }),
        connectWalletConnect: () =>
          run(async () => {
            const remote = await connectWalletConnect(network)
            try {
              await selectChain(remote, network)
              const account = await readWalletConnectAccount(remote, network)
              setProvider(remote)
              setAddress(account)
            } catch (cause) {
              // Do not leave an unusable restored session that prevents a new
              // pairing when the selected chain or account was not approved.
              await remote.disconnect?.().catch(() => undefined)
              throw cause
            }
          }),
        disconnect: () =>
          run(async () => {
            await provider?.disconnect?.()
            setAddress(null)
            setSession(null)
            setProvider(null)
            setError(null)
          }),
        switchNetwork: (target) =>
          run(async () => {
            if (provider) await selectChain(provider, target)
            setSession(null)
            setNetwork(target)
          }),
        authorize: (days) =>
          run(async () => {
            if (!address || ![1, 7, 30].includes(days)) throw new Error('Choose a session duration')
            const scope = scopeFor(address, network)
            const client = await requireOwner()
            const next: BrowserSession = {
              privateKey: session?.privateKey ?? generatePrivateKey(),
              expiresAt: Math.floor(Date.now() / 1000) + days * 86400,
            }
            // Save before requesting a transaction so a reload cannot lose an authorized key.
            await saveBrowserSession(scope, next)
            if (identity.current === scope) setSession({ ...next })
            const hash = await client.writeContract(
              loginCall({
                chain: chains[network],
                address: privateKeyToAccount(next.privateKey).address,
                permissions: UPLOAD_PERMISSIONS,
                expiresAt: BigInt(next.expiresAt),
                origin: 'Filecoin Drive',
              })
            )
            next.transactionHash = hash
            await saveBrowserSession(scope, next)
            const receipt = await publicClient(network).waitForTransactionReceipt({ hash })
            if (receipt.status !== 'success') throw new Error('Session authorization reverted')
            if (identity.current === scope) setSession({ ...next })
          }),
        revoke: () =>
          run(async () => {
            if (!address || !session) return
            const scope = scopeFor(address, network)
            const client = await requireOwner()
            const hash = await client.writeContract(
              revokeCall({
                chain: chains[network],
                address: privateKeyToAccount(session.privateKey).address,
                permissions: UPLOAD_PERMISSIONS,
                origin: 'Filecoin Drive',
              })
            )
            const receipt = await publicClient(network).waitForTransactionReceipt({ hash })
            if (receipt.status !== 'success') throw new Error('Session revocation reverted')
            await saveBrowserSession(scope, null)
            if (identity.current === scope) setSession(null)
          }),
        paymentAction: (action) =>
          run(async () => {
            const client = await requireOwner()
            await action(new Synapse({ client: asClient(client), source: 'filecoin-pin' }))
          }),
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useBrowserWallet() {
  const context = useContext(Context)
  if (!context) throw new Error('BrowserWalletProvider is missing')
  return context
}
