import { asClient } from '@filoz/synapse-core/client'
import { loginCall, revokeCall } from '@filoz/synapse-core/session-key'
import { getSignerClient } from '@filoz/synapse-react'
import { Synapse } from '@filoz/synapse-sdk'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  type Address,
  BaseError,
  getAddress,
  type Hash,
  type SignTypedDataParameters,
  UserRejectedRequestError,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { signTypedData, writeContract } from 'viem/actions'
import { type Connector, useConfig, useConnections, useConnectors } from 'wagmi'
import { connect, disconnect, getConnectorClient, reconnect, switchChain } from 'wagmi/actions'
import { injected } from 'wagmi/connectors'
import { PendingWalletTransactionError, useWalletTransaction } from '../hooks/use-wallet-transaction.ts'
import {
  browserSynapse,
  chains,
  type DriveNetwork,
  SESSION_PERMISSIONS,
  SESSION_REVOCATION_PERMISSIONS,
  SessionPermissionError,
  scopeFor,
} from '../lib/filecoin-pin/browser-wallet.ts'
import {
  clearRememberedOwnerKeys,
  issueEncryptionCredential,
  type OwnerSigner,
} from '../lib/filecoin-pin/encryption.ts'
import { scanGroupKey } from '../lib/filecoin-pin/group-key-scan.ts'
import { APPLICATION_SOURCE } from '../lib/filecoin-pin/synapse.ts'
import {
  type BrowserProvider,
  connectWalletConnect,
  restoreWalletConnect,
  type WalletConnectProvider,
  walletConnectAvailable,
} from '../lib/filecoin-pin/wallet-connect.ts'
import { readWalletConnectAccount } from '../lib/filecoin-pin/wallet-connect-accounts.ts'
import { WalletConnectionError } from '../lib/filecoin-pin/wallet-error.ts'
import { installedWalletOptions, type WalletOption } from '../lib/filecoin-pin/wallet-options.ts'
import { readNetworkPreference, saveNetworkPreference } from '../lib/local-storage/network.ts'
import {
  type BrowserSession,
  loadBrowserSession,
  subscribeBrowserSession,
  updateBrowserSession,
} from '../lib/local-storage/session-vault.ts'
import { readWalletPreference, saveWalletPreference } from '../lib/local-storage/wallet-connection.ts'
import type { WalletTransaction } from '../lib/local-storage/wallet-transaction.ts'
import { ChainProvider } from './chain-provider.tsx'

type InjectedProvider = BrowserProvider
interface WalletConnection {
  address: Address | null
  network: DriveNetwork
  session: BrowserSession | null
  sessionStatus: 'none' | 'checking' | 'active' | 'inactive'
  busy: boolean
  restoring: boolean
  uploading: boolean
  deleting: boolean
  error: string | null
  options: WalletOption[]
  connect: (id?: string) => Promise<void>
  connectWalletConnect: () => Promise<void>
  walletConnectAvailable: boolean
  disconnect: () => Promise<void>
  switchNetwork: (network: DriveNetwork) => Promise<void>
  authorize: (days: number) => Promise<void>
  revoke: () => Promise<void>
  addEncryptionKey: () => Promise<void>
  /**
   * EIP-712 signer for the connected owner wallet, built on demand. Used by
   * downloads as the decrypt fallback when no session grant is usable; the
   * wallet prompt only fires when the signer actually signs.
   */
  ownerSigner: () => Promise<OwnerSigner | undefined>
  paymentAction: (
    action: (synapse: Synapse, confirm: (hash: Hash) => Promise<void>) => Promise<unknown>,
    kind?: 'deposit' | 'approve'
  ) => Promise<void>
  pendingTransaction: WalletTransaction | null
  checkingTransaction: boolean
  transactionRevision: number
  refreshTransaction: () => void
  setDeleting: (deleting: boolean) => void
  setUploading: (uploading: boolean) => void
}
const Context = createContext<WalletConnection | null>(null)

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return (
    <ChainProvider>
      <BrowserWalletSession>{children}</BrowserWalletSession>
    </ChainProvider>
  )
}

function BrowserWalletSession({ children }: { children: ReactNode }) {
  const config = useConfig()
  const queryClient = useQueryClient()
  const connectors = useConnectors()
  const connections = useConnections()
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null)
  const selectedConnection = connections.find((entry) => entry.connector.uid === selectedConnector?.uid)
  const [previousWallet] = useState(readWalletPreference)
  const [restoring, setRestoring] = useState(Boolean(previousWallet))
  const restoreEpoch = useRef(0)
  const [address, setAddress] = useState<Address | null>(null)
  const [network, setNetwork] = useState<DriveNetwork>(readNetworkPreference)
  const [session, setSession] = useState<BrowserSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<WalletConnection['sessionStatus']>('none')
  const [walletOperation, setWalletOperation] = useState<'wallet' | 'session' | null>(null)
  const busy = walletOperation !== null
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const operations = useRef({ uploading: false, deleting: false })
  const [error, setError] = useState<string | null>(null)
  const options: WalletOption[] = installedWalletOptions(connectors)
  const [provider, setProvider] = useState<InjectedProvider | null>(null)
  const identity = useRef('')
  identity.current = address ? scopeFor(address, network) : ''
  const locked = useRef(false)
  locked.current = busy || uploading || deleting
  const connectionAttempts = useRef(new Map<string, AbortController>())
  useEffect(
    () => () => {
      for (const controller of connectionAttempts.current.values()) controller.abort()
    },
    []
  )
  const deferredAccount = useRef<Address | null | undefined>(undefined)

  const reconcileTransaction = useCallback(
    async (transaction: WalletTransaction) => {
      if (!address || !session || (transaction.kind !== 'authorize' && transaction.kind !== 'revoke')) return false
      if (
        transaction.session &&
        (transaction.session.key !== privateKeyToAccount(session.privateKey).address ||
          transaction.session.revision !== session.revision)
      )
        return false
      const runtime = browserSynapse(address, network, session)
      if (transaction.kind === 'revoke') return runtime.isRevoked()
      try {
        await runtime.validate()
        return runtime.expiresAt() >= (transaction.expiresAt ?? Infinity)
      } catch (cause) {
        if (cause instanceof SessionPermissionError) return false
        throw cause
      }
    },
    [address, network, session]
  )
  const transactionConfirmed = useCallback(
    async (transaction: WalletTransaction) => {
      if (!address) return
      const scope = scopeFor(address, network)
      if (transaction.kind === 'revoke') {
        // Older pending records have no key address; only clear those after checking the current grant.
        const key =
          transaction.session?.key ??
          (session && (await browserSynapse(address, network, session).isRevoked())
            ? privateKeyToAccount(session.privateKey).address
            : undefined)
        const remaining = await updateBrowserSession(scope, (current) =>
          current &&
          privateKeyToAccount(current.privateKey).address === key &&
          (!transaction.session || current.revision === transaction.session.revision)
            ? null
            : current
        )
        if (identity.current === scope) setSession(remaining)
      } else if (transaction.kind === 'authorize') {
        const restored = await updateBrowserSession(scope, (current) =>
          current &&
          transaction.session?.key === privateKeyToAccount(current.privateKey).address &&
          transaction.session.revision === current.revision
            ? { ...current, transactionHash: transaction.hash }
            : current
        )
        if (identity.current === scope && restored) setSession(restored)
      }
    },
    [address, network, session]
  )
  const selectedNetwork = useRef(network)
  selectedNetwork.current = network
  const remoteAdapter = useCallback((remote: WalletConnectProvider) => {
    return injected({
      shimDisconnect: false,
      target: {
        id: 'drive-walletconnect',
        name: 'WalletConnect',
        provider: {
          request: (async (request: { method: string; params?: unknown }) =>
            request.method === 'eth_accounts' || request.method === 'eth_requestAccounts'
              ? [await readWalletConnectAccount(remote, selectedNetwork.current)]
              : remote.request(request as Parameters<InjectedProvider['request']>[0])) as InjectedProvider['request'],
          on: remote.on?.bind(remote) ?? (() => undefined),
          removeListener: remote.removeListener?.bind(remote) ?? (() => undefined),
        } as InjectedProvider,
      },
    })
  }, [])

  const transaction = useWalletTransaction(address, network, busy, reconcileTransaction, transactionConfirmed)

  useEffect(() => {
    if (!restoring || !previousWallet) return
    let cancelled = false
    const epoch = restoreEpoch.current
    const rememberedConnector =
      previousWallet.type === 'injected'
        ? connectors.find((entry) => (previousWallet.rdns ? entry.id === previousWallet.rdns : entry.id === 'injected'))
        : undefined
    const restore = async () => {
      const restored = previousWallet.type === 'walletconnect' ? await restoreWalletConnect(network) : null
      const connector =
        previousWallet.type === 'walletconnect'
          ? restored
            ? remoteAdapter(restored.provider)
            : undefined
          : rememberedConnector
      if (!connector) {
        if (previousWallet.type === 'walletconnect') setRestoring(false)
        return
      }
      try {
        const result = await queryClient.fetchQuery({
          queryKey: [
            'drive-wallet-reconnect',
            previousWallet.type,
            previousWallet.type === 'injected' ? (previousWallet.rdns ?? 'injected') : 'walletconnect',
            epoch,
          ],
          queryFn: () => reconnect(config, { connectors: [connector] }),
          retry: false,
          gcTime: 0,
          structuralSharing: false,
        })
        if (cancelled || epoch !== restoreEpoch.current) return
        if (result[0]) {
          setSelectedConnector(result[0].connector)
          setAddress(getAddress(result[0].accounts[0]))
          setProvider(restored?.provider ?? ((await result[0].connector.getProvider()) as InjectedProvider))
        }
      } finally {
        if (!cancelled && epoch === restoreEpoch.current) setRestoring(false)
      }
    }
    void restore().catch(() => {
      if (!cancelled) setRestoring(false)
    })
    const timeout = window.setTimeout(
      () => {
        cancelled = true
        setRestoring(false)
      },
      previousWallet.type === 'injected' && !rememberedConnector ? 2000 : 8000
    )
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [config, connectors, previousWallet, restoring, network, remoteAdapter, queryClient])

  useEffect(() => {
    setSession(null)
    if (!address) return
    let cancelled = false
    let revision = 0
    const scope = scopeFor(address, network)
    const restore = async () => {
      const reading = ++revision
      try {
        const value = await loadBrowserSession(scope)
        if (!cancelled && reading === revision)
          setSession((current) =>
            current?.privateKey === value?.privateKey &&
            current?.expiresAt === value?.expiresAt &&
            current?.transactionHash === value?.transactionHash &&
            current?.revision === value?.revision
              ? current
              : value
          )
      } catch {
        if (!cancelled) setError('Unable to restore the upload session. Browser storage must be available.')
      }
    }
    const unsubscribe = subscribeBrowserSession(scope, () => void restore())
    void restore()
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [address, network])

  const sessionMutationPending =
    walletOperation === 'session' || transaction.pending?.kind === 'authorize' || transaction.pending?.kind === 'revoke'

  useEffect(() => {
    if (!address || !session) {
      setSessionStatus('none')
      return
    }
    let cancelled = false
    setSessionStatus('checking')
    // Authorization and revocation can change these expirations. Wait until they
    // settle; deposits and payment approvals do not affect session permissions.
    if (sessionMutationPending) return
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
              void updateBrowserSession(scopeFor(address, network), (current) =>
                current?.privateKey === session.privateKey &&
                current.revision === session.revision &&
                current.expiresAt === session.expiresAt
                  ? { ...current, expiresAt }
                  : current
              ).catch(() => setError('Unable to save the verified session expiry.'))
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
  }, [address, network, session, sessionMutationPending])

  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => {
      if (session.expiresAt <= Date.now() / 1000) setSessionStatus('inactive')
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session])

  useEffect(() => {
    const next = selectedConnection?.accounts[0] ?? null
    if (!provider || next === address) return
    if (locked.current) {
      deferredAccount.current = next
      setError(
        'Your wallet changed accounts. The current operation remains attached to its original wallet; the view switches when it finishes.'
      )
    } else {
      setSession(null)
      setAddress(next)
      // A different account must never silently decrypt with the old
      // account's still-cached root key.
      clearRememberedOwnerKeys()
      if (!next) setProvider(null)
    }
  }, [selectedConnection?.accounts, address, provider])

  useEffect(() => {
    if (!busy && !uploading && !deleting && deferredAccount.current !== undefined) {
      setSession(null)
      setAddress(deferredAccount.current)
      clearRememberedOwnerKeys()
      if (!deferredAccount.current) setProvider(null)
      deferredAccount.current = undefined
    }
  }, [busy, uploading, deleting])

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

  const selectChain = useCallback(
    async (_wallet: InjectedProvider, target: DriveNetwork) => {
      await switchChain(config, { connector: selectedConnector ?? undefined, chainId: chains[target].id })
    },
    [config, selectedConnector]
  )

  const run = async (action: () => Promise<void>, kind: 'wallet' | 'session' = 'wallet') => {
    if (locked.current) return
    restoreEpoch.current++
    setRestoring(false)
    locked.current = true
    setWalletOperation(kind)
    setError(null)
    try {
      await action()
    } catch (cause) {
      if (!(cause instanceof PendingWalletTransactionError)) {
        if (cause instanceof WalletConnectionError) console.warn('[Drive wallet connection]', cause, cause.cause)
        setError(cause instanceof Error ? cause.message : 'Wallet operation failed')
      }
    } finally {
      setWalletOperation(null)
      locked.current = operations.current.uploading || operations.current.deleting
    }
  }
  const runConnection = (walletId: string, action: (signal: AbortSignal) => Promise<void>) =>
    run(async () => {
      if (connectionAttempts.current.has(walletId))
        throw new Error(
          'A connection request for this wallet is still pending. You can choose another wallet. Open your wallet to finish or reject it. If the extension is unresponsive, restart it and reload this page before reconnecting.'
        )
      const controller = new AbortController()
      const promise = Promise.resolve().then(() => action(controller.signal))
      connectionAttempts.current.set(walletId, controller)
      const settled = () => {
        if (connectionAttempts.current.get(walletId) === controller) connectionAttempts.current.delete(walletId)
      }
      void promise.then(settled, settled)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          promise,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort()
              reject(
                new Error(
                  'The wallet did not respond within 45 seconds. Open your wallet to finish or reject the connection request. If the extension is unresponsive, restart it and reload this page. No new connection request has been sent.'
                )
              )
            }, 45_000)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    })
  const requireOwner = async () => {
    if (!provider || !address) throw new Error('Connect a wallet first.')
    await selectChain(provider, network)
    const account = (provider as Partial<WalletConnectProvider>).session
      ? await readWalletConnectAccount(provider as WalletConnectProvider, network)
      : (await provider.request({ method: 'eth_accounts' }))[0]
    if (account?.toLowerCase() !== address.toLowerCase())
      throw new Error('Wallet account changed. Reconnect before signing.')
    // A late response from another wallet can change wagmi's current connection.
    if (selectedConnector && config.state.current !== selectedConnector.uid)
      return getConnectorClient(config, { connector: selectedConnector, account: address, chainId: chains[network].id })
    return getSignerClient(config, { account: address, chainId: chains[network].id })
  }

  return (
    <Context.Provider
      value={{
        address,
        network,
        session,
        sessionStatus,
        busy,
        restoring,
        uploading,
        deleting,
        error: error ?? transaction.error,
        pendingTransaction: transaction.pending,
        checkingTransaction: transaction.checking,
        transactionRevision: transaction.revision,
        refreshTransaction: transaction.refresh,
        options,
        walletConnectAvailable,
        setUploading: (value) => {
          operations.current.uploading = value
          locked.current = value || operations.current.deleting || busy
          setUploading(value)
        },
        setDeleting: (value) => {
          operations.current.deleting = value
          locked.current = value || operations.current.uploading || busy
          setDeleting(value)
        },
        connect: (id) =>
          runConnection(id ?? options[0]?.id ?? 'unavailable', async (signal) => {
            const option = options.find((item) => item.id === id) ?? options[0]
            if (!option) throw new Error('Install an Ethereum-compatible browser wallet to connect.')
            const connector = connectors.find((entry) => entry.uid === option.id)
            if (!connector) throw new Error('Wallet is unavailable')
            let result: { accounts: readonly Address[]; chainId: number }
            try {
              result = config.state.connections.get(connector.uid) ?? (await connect(config, { connector }))
            } catch (cause) {
              throw new WalletConnectionError(option.name, chains[network].name, 'connect', cause)
            }
            signal.throwIfAborted()
            if (result.chainId !== chains[network].id) {
              try {
                await switchChain(config, { connector, chainId: chains[network].id })
              } catch (cause) {
                throw new WalletConnectionError(option.name, chains[network].name, 'switch network', cause)
              }
            }
            signal.throwIfAborted()
            const selectedProvider = (await connector.getProvider()) as InjectedProvider
            signal.throwIfAborted()
            setSelectedConnector(connector)
            setProvider(selectedProvider)
            setAddress(getAddress(result.accounts[0]))
            saveWalletPreference({ type: 'injected', ...(option.rdns ? { rdns: option.rdns } : {}) })
          }),
        connectWalletConnect: () =>
          run(async () => {
            const remote = await connectWalletConnect(network)
            try {
              const result = await connect(config, { connector: remoteAdapter(remote), chainId: chains[network].id })
              const connector = [...config.state.connections.values()]
                .reverse()
                .find((entry) => entry.connector.id === 'drive-walletconnect')?.connector
              if (!connector) throw new Error('WalletConnect connection is unavailable.')
              if (result.chainId !== chains[network].id)
                await switchChain(config, { connector, chainId: chains[network].id })
              const account = await readWalletConnectAccount(remote, network)
              setSelectedConnector(connector)
              setProvider(remote)
              setAddress(account)
              saveWalletPreference({ type: 'walletconnect' })
            } catch (cause) {
              // Do not leave an unusable restored session that prevents a new
              // pairing when the selected chain or account was not approved.
              await remote.disconnect?.().catch(() => undefined)
              throw cause
            }
          }),
        disconnect: () =>
          run(async () => {
            saveWalletPreference(null)
            await disconnect(config, { connector: selectedConnector ?? undefined })
            await provider?.disconnect?.()
            setAddress(null)
            setSession(null)
            setProvider(null)
            setError(null)
            // Root-derived group keys cached for silent decrypts die with the wallet.
            clearRememberedOwnerKeys()
          }),
        switchNetwork: (target) =>
          run(async () => {
            if (provider) await selectChain(provider, target)
            setSession(null)
            setNetwork(target)
            saveNetworkPreference(target)
          }),
        authorize: (days) =>
          run(async () => {
            if (transaction.pending) return
            if (!address || ![1, 7, 30].includes(days)) throw new Error('Choose a session duration')
            const scope = scopeFor(address, network)
            const client = await requireOwner()
            let previous: BrowserSession | null = null
            const next = await updateBrowserSession(scope, (current) => {
              previous = current
              return {
                privateKey: current?.privateKey ?? generatePrivateKey(),
                expiresAt: Math.floor(Date.now() / 1000) + days * 86400,
                revision: crypto.randomUUID(),
                // The grant is wrapped to the session key pair. Re-authorizing reuses
                // the key, so a preserved credential stays valid: no new signature.
                ...(current?.encryption ? { encryption: current.encryption } : {}),
              }
            })
            if (!next) throw new Error('Unable to save the upload session.')
            // Save before requesting a transaction so a reload cannot lose an authorized key.
            if (identity.current === scope) setSession({ ...next })
            const sessionKey = privateKeyToAccount(next.privateKey).address
            let hash: Hash
            try {
              hash = await writeContract(
                client,
                loginCall({
                  chain: chains[network],
                  address: sessionKey,
                  permissions: SESSION_PERMISSIONS,
                  expiresAt: BigInt(next.expiresAt),
                  origin: 'Filecoin Drive',
                })
              )
            } catch (cause) {
              const rejected = (error: unknown) =>
                error instanceof UserRejectedRequestError ||
                (typeof error === 'object' && error !== null && 'code' in error && error.code === 4001)
              if (rejected(cause) || (cause instanceof BaseError && rejected(cause.walk(rejected)))) {
                // Only a definite refusal can discard the draft; transport errors may hide a submission.
                const restored = await updateBrowserSession(scope, (current) =>
                  current && current.revision === next.revision && current.privateKey === next.privateKey
                    ? previous
                    : current
                )
                if (identity.current === scope) setSession(restored)
              }
              throw cause
            }
            // Track the submitted hash immediately; the key was saved before signing.
            await transaction.confirm(hash, 'authorize', next.expiresAt, { key: sessionKey, revision: next.revision })
          }, 'session'),
        revoke: () =>
          run(async () => {
            if (transaction.pending || !address || !session) return
            const client = await requireOwner()
            const hash = await writeContract(
              client,
              revokeCall({
                chain: chains[network],
                address: privateKeyToAccount(session.privateKey).address,
                permissions: SESSION_REVOCATION_PERMISSIONS,
                origin: 'Filecoin Drive',
              })
            )
            await transaction.confirm(hash, 'revoke', undefined, {
              key: privateKeyToAccount(session.privateKey).address,
              revision: session.revision,
            })
          }, 'session'),
        addEncryptionKey: () =>
          run(async () => {
            if (!address || !session || session.expiresAt <= Math.floor(Date.now() / 1000))
              throw new Error('Authorize an upload session first.')
            const scope = scopeFor(address, network)
            const client = await requireOwner()
            const signer: OwnerSigner = {
              address,
              signTypedData: (args) =>
                signTypedData(client, { account: address, ...args } as unknown as SignTypedDataParameters),
            }
            // A renewed session restores access with 1 signature: the vault still
            // records the group key. First-time setup scans the owner's data sets
            // so Drive lands on the same group key the CLI would.
            const recorded = session.encryption
              ? { groupKeyId: session.encryption.groupKeyId, commitment: session.encryption.commitment }
              : await scanGroupKey(new Synapse({ client: asClient(client), source: APPLICATION_SOURCE }))
            const credential = await issueEncryptionCredential(signer, session.privateKey, recorded)
            // No transaction: the grant never leaves this browser. Persist it beside
            // the session key it is wrapped to; a rotated key keeps nothing stale.
            const saved = await updateBrowserSession(scope, (current) => {
              if (!current || current.privateKey !== session.privateKey)
                throw new Error(
                  'Your browser session changed. The encryption key was not saved. Try again in Wallet setup.'
                )
              return { ...current, encryption: credential }
            })
            if (identity.current === scope && saved) setSession(saved)
          }, 'session'),
        ownerSigner: async () => {
          if (!address) return undefined
          const client = await requireOwner()
          const owner = address
          return {
            address: owner,
            signTypedData: (args) =>
              signTypedData(client, { account: owner, ...args } as unknown as SignTypedDataParameters),
          }
        },
        paymentAction: (action, kind = 'deposit') =>
          run(async () => {
            if (transaction.pending) return
            const client = await requireOwner()
            await action(new Synapse({ client: asClient(client), source: APPLICATION_SOURCE }), (hash) =>
              transaction.confirm(hash, kind)
            )
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
