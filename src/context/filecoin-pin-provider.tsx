import type { FilecoinChain } from '@filoz/synapse-core/chains'
import { useQuery } from '@tanstack/react-query'
import { checkAllowances, validateGasRequirement } from 'filecoin-pin/core/payments'
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
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
  const chainQuery = useQuery({
    queryKey: ['drive-storage-chain', connection.network],
    queryFn: () => resolveStorageChain(chains[connection.network]),
    staleTime: 0,
    retry: true,
    retryDelay: (attempt) => Math.min(5000 * 2 ** attempt, 30000),
  })
  const storageChain: FilecoinChain | null = chainQuery.data ?? null
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

  const transactionRevision = connection.transactionRevision ?? 0
  const snapshotQuery = useQuery({
    queryKey: ['drive-wallet-snapshot', storageScope, storageChain?.contracts.fwssView.address, transactionRevision],
    enabled: !!runtime,
    queryFn: async () => {
      if (!runtime) throw new Error('Connect a wallet first.')
      const [snapshot, approval] = await Promise.all([
        fetchWalletSnapshot(runtime.synapse),
        checkAllowances(runtime.synapse),
      ])
      return { snapshot, approval }
    },
  })
  const refreshWallet = useCallback(async () => {
    await snapshotQuery.refetch()
  }, [snapshotQuery.refetch])
  useEffect(() => {
    if (!storageChain) {
      setWallet(
        chainQuery.failureCount
          ? { status: 'error', error: 'Unable to load current storage configuration. Retrying chain reads…' }
          : initialWalletState
      )
      setStorageSetup({
        status: chainQuery.failureCount ? 'error' : 'checking',
        depositReady: false,
        approvalReady: false,
        gasReady: false,
      })
      return
    }
    if (snapshotQuery.isError) {
      setWallet({
        status: 'error',
        error: `Unable to load wallet balances: ${snapshotQuery.error.message}`,
        data: snapshotQuery.data?.snapshot,
      })
      setStorageSetup((previous) => ({ ...previous, status: 'error' }))
      return
    }
    const result = snapshotQuery.data
    if (!result) {
      setWallet({ status: 'loading' })
      setStorageSetup((previous) => ({ ...previous, status: 'checking' }))
      return
    }
    const { snapshot, approval } = result
    const depositReady = snapshot.raw.filecoinPayBalance > 0n
    const approvalReady = !approval.needsUpdate
    const gas = validateGasRequirement(snapshot.filBalance, snapshot.network === 'calibration')
    setWallet({ status: snapshotQuery.isFetching ? 'loading' : 'ready', data: snapshot })
    setStorageSetup({
      status: snapshotQuery.isFetching
        ? 'checking'
        : depositReady && approvalReady && gas.isValid
          ? 'ready'
          : 'blocked',
      depositReady,
      approvalReady,
      gasReady: gas.isValid,
      gasIssue: gas.errorMessage,
    })
  }, [
    storageChain,
    chainQuery.failureCount,
    snapshotQuery.data,
    snapshotQuery.isError,
    snapshotQuery.error,
    snapshotQuery.isFetching,
  ])

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
