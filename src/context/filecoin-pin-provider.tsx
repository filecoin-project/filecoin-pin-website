import type { FilecoinChain } from '@filoz/synapse-core/chains'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { checkAllowances, validateGasRequirement } from 'filecoin-pin/core/payments'
import { createContext, type ReactNode, useCallback, useEffect, useMemo } from 'react'
import type { Hex } from 'viem'
import { type DataSetState, useDataSetManager } from '../hooks/use-data-set-manager.ts'
import { browserSynapse, chains, scopeFor } from '../lib/filecoin-pin/browser-wallet.ts'
import type { EncryptionCredential } from '../lib/filecoin-pin/encryption.ts'
import { resolveStorageChain } from '../lib/filecoin-pin/storage-chain.ts'
import type { Synapse } from '../lib/filecoin-pin/synapse.ts'
import { fetchWalletSnapshot, storageFundsStatus, type WalletSnapshot } from '../lib/filecoin-pin/wallet.ts'
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
    fundsStatus?: ReturnType<typeof storageFundsStatus>
  }
  wallet: WalletState
  refreshWallet: () => Promise<void>
  synapse: Synapse | null
  dataSet: DataSetState
  checkIfDatasetExists: () => Promise<bigint[]>
  addDataSetId: (id: bigint) => void
  debugParams: DebugParams
  storageScope?: string
  /**
   * Encryption credentials for the active session. `ready` false blocks
   * uploads (encryption is never silently skipped); downloads fall back to
   * the owner wallet when no grant is usable.
   */
  encryption:
    | { ready: true; sessionPrivateKey: Hex; credential: EncryptionCredential; legacyCredential?: EncryptionCredential }
    | { ready: false; sessionPrivateKey?: Hex; credential?: undefined; legacyCredential?: EncryptionCredential }
  ensurePermissions?: () => Promise<void>
}

export const FilecoinPinContext = createContext<FilecoinPinContextValue | undefined>(undefined)

const initialWalletState: WalletState = { status: 'idle' }

export const FilecoinPinProvider = ({ children }: { children: ReactNode }) => {
  const connection = useBrowserWallet()
  const queryClient = useQueryClient()
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
    queryKey: [
      'drive-wallet-snapshot',
      storageScope,
      storageChain?.contracts.fwssView.address,
      transactionRevision,
      'account-summary-v1',
    ],
    enabled: !!runtime,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!runtime) throw new Error('Connect a wallet first.')
      const [snapshot, approval, account] = await Promise.all([
        fetchWalletSnapshot(runtime.synapse),
        checkAllowances(runtime.synapse),
        runtime.synapse.payments.accountSummary(),
      ])
      return { snapshot, approval, account }
    },
  })
  const refreshWallet = useCallback(async () => {
    if (!storageChain) {
      // Restart immediately rather than waiting for the configuration retry backoff.
      await queryClient.cancelQueries({ queryKey: ['drive-storage-chain', connection.network], exact: true })
      await chainQuery.refetch()
      // Resolving the configuration enables the wallet query on the next render.
      return
    }
    await Promise.all([
      snapshotQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['drive-storage-runway', storageScope] }),
      queryClient.invalidateQueries({ queryKey: ['drive-storage-budget', storageScope] }),
    ])
  }, [storageChain, connection.network, chainQuery.refetch, snapshotQuery.refetch, queryClient, storageScope])
  const { wallet, storageSetup } = useMemo<{
    wallet: WalletState
    storageSetup: NonNullable<FilecoinPinContextValue['storageSetup']>
  }>(() => {
    const checking = { status: 'checking' as const, depositReady: false, approvalReady: false, gasReady: false }
    if (!storageChain) {
      return {
        wallet: chainQuery.failureCount
          ? { status: 'error', error: 'Unable to load current storage configuration. Retrying chain reads…' }
          : initialWalletState,
        storageSetup: { ...checking, status: chainQuery.failureCount ? 'error' : 'checking' },
      }
    }
    if (!runtime) return { wallet: initialWalletState, storageSetup: checking }
    const result = snapshotQuery.data
    const fundsStatus = result ? storageFundsStatus(result.account) : undefined
    const depositReady = !!result && fundsStatus === 'available'
    const approvalReady = !!result && !result.approval.needsUpdate
    const gas = result
      ? validateGasRequirement(result.snapshot.filBalance, result.snapshot.network === 'calibration')
      : undefined
    const readiness = {
      depositReady,
      fundsStatus,
      approvalReady,
      gasReady: gas?.isValid ?? false,
      gasIssue: gas?.errorMessage,
    } as const
    if (snapshotQuery.isError) {
      return {
        wallet: {
          status: 'error',
          error: `Unable to load wallet balances: ${snapshotQuery.error.message}`,
          data: result?.snapshot,
        },
        storageSetup: { ...readiness, status: 'error' },
      }
    }
    if (!result) return { wallet: { status: 'loading' }, storageSetup: checking }
    return {
      // Preserve selected files during background balance refreshes. The last
      // verified setup remains usable until new data or a read error arrives.
      wallet: { status: 'ready', data: result.snapshot },
      storageSetup: {
        ...readiness,
        status: depositReady && approvalReady && gas?.isValid ? 'ready' : 'blocked',
      },
    }
  }, [storageChain, runtime, chainQuery.failureCount, snapshotQuery.data, snapshotQuery.isError, snapshotQuery.error])

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

  const encryption = useMemo<FilecoinPinContextValue['encryption']>(() => {
    const session = connection.session
    if (!runtime || !session) return { ready: false }
    // Uploads written by keysmith 0.1.0 keep opening silently, with or without a current key.
    const legacy = runtime.legacyEncryptionReady() ? { legacyCredential: session.legacyEncryption } : {}
    if (runtime.encryptionReady() && session.encryption)
      return { ready: true, sessionPrivateKey: session.privateKey, credential: session.encryption, ...legacy }
    return legacy.legacyCredential
      ? { ready: false, sessionPrivateKey: session.privateKey, ...legacy }
      : { ready: false }
  }, [runtime, connection.session])

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
      encryption,
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
      encryption,
      runtime,
    ]
  )

  return <FilecoinPinContext.Provider value={value}>{children}</FilecoinPinContext.Provider>
}
