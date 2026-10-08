import type { FilecoinChain } from '@filoz/synapse-core/chains'
import { checkAllowances, validateGasRequirement } from 'filecoin-pin/core/payments'
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DataSetState, useDataSetManager } from '../hooks/use-data-set-manager.ts'
import { browserSynapse, chains, scopeFor } from '../lib/filecoin-pin/browser-wallet.ts'
import { resolveStorageChain } from '../lib/filecoin-pin/storage-chain.ts'
import type { Synapse } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'
import { getOrCreateClientId } from '../lib/local-storage/client-id.ts'
import { type DebugParams, getDebugParams, logDebugParams } from '../utils/debug-params.ts'
import { useBrowserWallet } from './browser-wallet-provider.tsx'

type WalletState =
  | { status: 'idle'; data?: WalletSnapshot }
  | { status: 'loading'; data?: WalletSnapshot }
  | { status: 'ready'; data: WalletSnapshot }
  | { status: 'error'; error: string; data?: WalletSnapshot }

export interface FilecoinPinContextValue {
  storageSetup?: {
    status: 'checking' | 'ready' | 'blocked' | 'error'
    depositReady: boolean
    approvalReady: boolean
    gasReady: boolean
    gasIssue?: string
  }
  wallet: WalletState
  refreshWallet: () => Promise<void>
  synapse: Synapse | null
  dataSet: DataSetState
  checkIfDatasetExists: () => Promise<bigint[]>
  addDataSetId: (id: bigint) => void
  debugParams: DebugParams
  storageScope?: string
  ensurePermissions?: () => Promise<void>
}

export const FilecoinPinContext = createContext<FilecoinPinContextValue | undefined>(undefined)

const initialWalletState: WalletState = { status: 'idle' }

export const FilecoinPinProvider = ({ children }: { children: ReactNode }) => {
  const [wallet, setWallet] = useState<WalletState>(initialWalletState)
  const [storageSetup, setStorageSetup] = useState<NonNullable<FilecoinPinContextValue['storageSetup']>>({
    status: 'checking',
    depositReady: false,
    approvalReady: false,
    gasReady: false,
  })
  const connection = useBrowserWallet()
  const [storageChain, setStorageChain] = useState<FilecoinChain | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = 5000
    const resolve = async () => {
      try {
        const chain = await resolveStorageChain(chains[connection.network])
        if (!cancelled) setStorageChain(chain)
      } catch {
        if (cancelled) return
        setStorageSetup((previous) => ({ ...previous, status: 'error' }))
        setWallet({ status: 'error', error: 'Unable to load current storage configuration. Retrying chain reads…' })
        timer = setTimeout(() => void resolve(), delay)
        delay = Math.min(delay * 2, 30000)
      }
    }
    setStorageChain(null)
    void resolve()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [connection.network])
  const runtime = useMemo(
    () =>
      connection.address && storageChain?.id === chains[connection.network].id
        ? browserSynapse(connection.address, connection.network, connection.session, storageChain)
        : null,
    [connection.address, connection.network, connection.session, storageChain]
  )
  const storageScope = connection.address ? scopeFor(connection.address, connection.network) : undefined

  const debugParams = useMemo(() => getDebugParams(), [])

  const { dataSet, checkIfDatasetExists, addDataSetId } = useDataSetManager({
    synapse: runtime?.synapse ?? null,
    walletAddress: storageScope ?? null,
    debugParams,
  })

  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const refreshInFlightRef = useRef<{ runtime: typeof runtime; promise: Promise<void> } | null>(null)

  const refreshWallet = useCallback(async () => {
    if (!runtime) return
    // Dedupe concurrent calls (StrictMode double-invokes the mount effect in
    // dev) so the snapshot is fetched once.
    if (refreshInFlightRef.current?.runtime === runtime) return refreshInFlightRef.current.promise

    setWallet((prev) => ({
      status: 'loading',
      data: prev.status === 'ready' ? prev.data : undefined,
    }))
    setStorageSetup((previous) => ({ ...previous, status: 'checking' }))

    const refresh = (async () => {
      try {
        const synapse = runtime.synapse

        const [snapshot, approval] = await Promise.all([fetchWalletSnapshot(synapse), checkAllowances(synapse)])
        if (runtimeRef.current !== runtime) return
        const depositReady = snapshot.raw.filecoinPayBalance > 0n
        const approvalReady = !approval.needsUpdate
        const gas = validateGasRequirement(snapshot.filBalance, snapshot.network === 'calibration')
        setStorageSetup({
          status: depositReady && approvalReady && gas.isValid ? 'ready' : 'blocked',
          depositReady,
          approvalReady,
          gasReady: gas.isValid,
          gasIssue: gas.errorMessage,
        })
        setWallet({
          status: 'ready',
          data: snapshot,
        })
      } catch (error) {
        if (runtimeRef.current !== runtime) return
        setStorageSetup((previous) => ({ ...previous, status: 'error' }))
        console.error('Failed to load wallet balances', error)
        setWallet((prev) => ({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to load wallet balances. See console for details.',
          data: prev.data,
        }))
      } finally {
        if (refreshInFlightRef.current?.runtime === runtime) refreshInFlightRef.current = null
      }
    })()
    refreshInFlightRef.current = { runtime, promise: refresh }
    return refresh
  }, [runtime])

  useEffect(() => {
    void refreshWallet()
  }, [refreshWallet])

  useEffect(() => {
    logDebugParams()
    // Establish the per-browser client id before any dataset lookups run. On
    // first creation this also purges legacy shared-wallet dataset ids from
    // localStorage, so the history view never enumerates the communal
    // datasets that predate per-browser isolation.
    getOrCreateClientId()
  }, [])

  // Proactively check for existing data set when prerequisites are ready,
  // so we can load upload history before the user interacts
  useEffect(() => {
    if (wallet.status === 'ready' && runtime && dataSet.status === 'idle') {
      console.debug('[DataSet] Wallet and Synapse ready, proactively checking if data set exists')
      void checkIfDatasetExists()
    }
  }, [wallet.status, runtime, checkIfDatasetExists, dataSet.status])

  const value = useMemo<FilecoinPinContextValue>(
    () => ({
      wallet,
      storageSetup,
      refreshWallet,
      synapse: runtime?.synapse ?? null,
      dataSet,
      checkIfDatasetExists,
      addDataSetId,
      debugParams,
      storageScope,
      ensurePermissions: runtime?.validate,
    }),
    [
      wallet,
      storageSetup,
      refreshWallet,
      dataSet,
      checkIfDatasetExists,
      addDataSetId,
      debugParams,
      storageScope,
      runtime,
    ]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
