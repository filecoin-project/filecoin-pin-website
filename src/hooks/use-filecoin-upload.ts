import { CommitError, type PDPProvider, StoreError } from '@filoz/synapse-sdk'
import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import {
  checkUploadReadiness,
  executeUpload,
  type UploadExecutionOptions,
  type UploadExecutionResult,
} from 'filecoin-pin/core/upload'
import pino from 'pino'
import { useCallback, useState } from 'react'
import { MAX_FILE_SIZE } from '../constants/files.ts'
import { createFreshUploadContexts } from '../lib/filecoin-pin/fresh-contexts.ts'
import { ensureSessionKeyPermissions } from '../lib/filecoin-pin/synapse.ts'
import { prepareUploadContexts } from '../lib/filecoin-pin/upload-funding.ts'
import { getOrCreateClientId } from '../lib/local-storage/client-id.ts'
import { addStoredDataSetId, clearStoredDataSetIds, getStoredDataSetIds } from '../lib/local-storage/data-set.ts'
import type { StepState } from '../types/upload/step.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { useWaitableRef } from './use-waitable-ref.ts'

interface UploadState {
  confirmedPieces?: { dataSetId: bigint; providerId: bigint; pieceId: bigint; transactionHash: string }[]
  isUploading: boolean
  stepStates: StepState[]
  error?: string
  currentCid?: string
  pieceCid?: string
  transactionHash?: string
  transactionHashes: string[]
  confirmedCopies: number
  expectedCopies: number
  copies?: UploadExecutionResult['copies']
  /** Provider info collected during upload, keyed by providerId.toString(). */
  providersById: Record<string, PDPProvider>
  network?: string
}

const logger = pino({
  level: 'debug',
  browser: {
    asObject: true,
  },
})

export const INITIAL_STEP_STATES: StepState[] = [
  { step: 'creating-car', progress: 0, status: 'pending' },
  { step: 'checking-readiness', progress: 0, status: 'pending' },
  { step: 'uploading-car', progress: 0, status: 'pending' },
  { step: 'replicating', progress: 0, status: 'pending' },
  { step: 'announcing-cids', progress: 0, status: 'pending' },
  { step: 'finalizing-transaction', progress: 0, status: 'pending' },
]

export const INPI_ERROR_MESSAGE =
  "CID not yet indexed by IPNI. It's stored on Filecoin and fetchable now, but may take time to appear on IPFS."

/**
 * True when executeUpload failed while resolving explicitly-passed dataset ids
 * (deleted dataset, wrong owner, two datasets on the same provider). Callers
 * must also confirm no upload progress events fired: dataset resolution
 * happens before any bytes are uploaded, so message matching alone could
 * misclassify a later provider or payments error that shares these phrases.
 */
const isDataSetResolutionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return /does not exist|not owned by|duplicate providers|not found in registry|resolved to/i.test(message)
}

/**
 * True for store and commit failures surfaced by Synapse (`StoreError` /
 * `CommitError`). On the resume path these indicate the provider behind a
 * stored dataset id is unreachable. A caller must also confirm no bytes were
 * stored yet: after a 'stored' event the same error indicates a failure mid-
 * upload rather than an unreachable resumed provider.
 */
const isProviderStoreError = (error: unknown): boolean => StoreError.is(error) || CommitError.is(error)

/**
 * Handles the end-to-end upload workflow with filecoin-pin:
 * - Builds a CAR file in-browser
 * - Checks upload readiness (allowances, balances)
 * - Executes the upload with progress callbacks
 * - Tracks IPNI availability and on-chain confirmation
 */
export const useFilecoinUpload = () => {
  const { synapse, wallet, addDataSetId, debugParams, storageScope, ensurePermissions } = useFilecoinPinContext()

  // Waitable ref so the upload callback can access synapse even if initialized after callback creation
  const synapseRef = useWaitableRef(synapse)

  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    stepStates: INITIAL_STEP_STATES,
    transactionHashes: [],
    confirmedCopies: 0,
    expectedCopies: 0,
    providersById: {},
  })

  const updateStepState = useCallback((step: StepState['step'], updates: Partial<StepState>) => {
    setUploadState((prev) => ({
      ...prev,
      stepStates: prev.stepStates.map((stepState) =>
        stepState.step === step ? { ...stepState, ...updates } : stepState
      ),
    }))
  }, [])

  const uploadFile = useCallback(
    async (file: File, metadata?: Record<string, string>): Promise<string> => {
      setUploadState({
        isUploading: true,
        stepStates: INITIAL_STEP_STATES,
        transactionHashes: [],
        confirmedCopies: 0,
        expectedCopies: 0,
        providersById: {},
        confirmedPieces: [],
      })

      try {
        if (file.size > MAX_FILE_SIZE) throw new Error('Files must be smaller than 200 MB for browser uploads.')
        updateStepState('creating-car', { status: 'in-progress', progress: 0 })
        logger.info('Creating CAR from file')

        const carResult = await createCarFromFile(file, {
          onProgress: (bytesProcessed: number, totalBytes: number) => {
            const progressPercent = Math.round((bytesProcessed / totalBytes) * 100)
            updateStepState('creating-car', { progress: progressPercent })
          },
        })

        const rootCid = carResult.rootCid.toString()
        setUploadState((prev) => ({
          ...prev,
          currentCid: rootCid,
        }))

        updateStepState('creating-car', { status: 'completed', progress: 100 })
        logger.info('CAR created')

        updateStepState('checking-readiness', { status: 'in-progress', progress: 0 })
        logger.info('Waiting for synapse to be initialized')
        const synapse = await synapseRef.wait()
        logger.info('Synapse initialized')
        // Session-key permission checks are deferred from page load to here so
        // read-only visits make no permission-related RPC calls.
        await (ensurePermissions ? ensurePermissions() : ensureSessionKeyPermissions())
        updateStepState('checking-readiness', { progress: 50 })

        logger.info('Checking upload readiness')
        const readinessCheck = await checkUploadReadiness({
          synapse,
          fileSize: carResult.carBytes.length,
          autoConfigureAllowances: false,
        })

        logger.info({ readinessCheck }, 'Upload readiness check')

        if (readinessCheck.status === 'blocked') {
          throw new Error(
            [
              readinessCheck.validation?.errorMessage,
              ...(readinessCheck.suggestions ?? []),
              'Check your Filecoin Pay deposit and storage payment approval in Wallet setup.',
            ]
              .filter(Boolean)
              .join(' ')
          )
        }

        logger.info('Upload readiness check completed')

        logger.info('Uploading CAR to Synapse')
        // Distinguishes resolution failures (safe to retry into fresh data
        // sets) from errors after the upload started.
        let sawUploadProgress = false
        // Set once the primary copy's bytes land on a provider. Past this point
        // a store or commit failure reflects a problem mid-upload, so the
        // resume retry below leaves the stored dataset ids in place.
        let sawBytesStored = false
        const transactionsByProvider = new Map<string, string>()
        const baseOptions: UploadExecutionOptions = {
          logger,
          contextId: `upload-${Date.now()}`,
          pieceMetadata: {
            ...(metadata ?? {}),
            ...(new TextEncoder().encode(file.name).length <= 96 ? { label: file.name } : {}),
          },
          onProgress: (event) => {
            sawUploadProgress = true
            switch (event.type) {
              case 'providerSelected': {
                const provider = event.data.provider
                setUploadState((prev) => ({
                  ...prev,
                  providersById: { ...prev.providersById, [String(provider.id)]: provider },
                }))
                break
              }

              case 'dataSetResolved': {
                const provider = event.data.provider
                setUploadState((prev) => ({
                  ...prev,
                  providersById: { ...prev.providersById, [String(provider.id)]: provider },
                }))
                break
              }

              case 'stored':
                sawBytesStored = true
                console.debug('[FilecoinUpload] Stored on provider:', String(event.data.providerId))
                setUploadState((prev) => ({
                  ...prev,
                  pieceCid: event.data.pieceCid.toString(),
                }))
                updateStepState('uploading-car', { status: 'completed', progress: 100 })
                updateStepState('replicating', { status: 'in-progress', progress: 0 })
                break

              case 'copyComplete':
                console.debug('[FilecoinUpload] Secondary copy complete on provider:', String(event.data.providerId))
                updateStepState('replicating', { status: 'completed', progress: 100 })
                updateStepState('announcing-cids', { status: 'in-progress', progress: 0 })
                break

              case 'copyFailed':
                console.debug('[FilecoinUpload] Secondary copy failed on provider:', String(event.data.providerId))
                updateStepState('replicating', {
                  status: 'error',
                  progress: 0,
                  error: 'Secondary copy failed, file stored with reduced redundancy',
                })
                updateStepState('announcing-cids', { status: 'in-progress', progress: 0 })
                break

              case 'piecesAdded': {
                const txHash = event.data.txHash
                transactionsByProvider.set(String(event.data.providerId), txHash)
                console.debug('[FilecoinUpload] Piece add transaction:', { txHash })
                setUploadState((prev) => {
                  const newHashes = txHash ? [...prev.transactionHashes, txHash] : prev.transactionHashes
                  const newExpected = prev.expectedCopies + 1
                  // Fallback: complete replicating if still in-progress
                  const stepStates = prev.stepStates.map((s) =>
                    s.step === 'replicating' && s.status === 'in-progress'
                      ? { ...s, status: 'completed' as const, progress: 100 }
                      : s
                  )
                  return {
                    ...prev,
                    transactionHash: txHash || prev.transactionHash,
                    transactionHashes: newHashes,
                    expectedCopies: newExpected,
                    stepStates,
                  }
                })
                updateStepState('finalizing-transaction', { status: 'in-progress', progress: 0 })
                break
              }

              case 'piecesConfirmed': {
                const confirmedDataSetId = event.data.dataSetId
                if (wallet?.status === 'ready' && confirmedDataSetId != null) {
                  addStoredDataSetId(storageScope ?? wallet.data.address, Number(confirmedDataSetId))
                  addDataSetId(confirmedDataSetId)
                }
                setUploadState((prev) => {
                  const newConfirmed = prev.confirmedCopies + 1
                  const allConfirmed = newConfirmed >= prev.expectedCopies && prev.expectedCopies > 0
                  return {
                    ...prev,
                    confirmedCopies: newConfirmed,
                    confirmedPieces:
                      event.data.pieceIds[0] === undefined
                        ? prev.confirmedPieces
                        : [
                            ...(prev.confirmedPieces ?? []).filter((piece) => piece.dataSetId !== confirmedDataSetId),
                            {
                              dataSetId: confirmedDataSetId,
                              providerId: event.data.providerId,
                              pieceId: event.data.pieceIds[0],
                              transactionHash: transactionsByProvider.get(String(event.data.providerId)) ?? '',
                            },
                          ],
                    stepStates: prev.stepStates.map((s) =>
                      s.step === 'finalizing-transaction'
                        ? {
                            ...s,
                            status: allConfirmed ? ('completed' as const) : ('in-progress' as const),
                            progress: Math.round((newConfirmed / Math.max(prev.expectedCopies, 1)) * 100),
                          }
                        : s
                    ),
                  }
                })
                console.debug('[FilecoinUpload] Upload confirmed on chain, dataSetId:', String(confirmedDataSetId))
                break
              }

              case 'pieceSyncStatus:failed': {
                console.warn('[FilecoinUpload] Piece sync check failed:', event.data.error.message)
                updateStepState('announcing-cids', {
                  status: 'error',
                  progress: 0,
                  error: INPI_ERROR_MESSAGE,
                })
                break
              }

              case 'indexingConfirmation:mismatch': {
                console.warn('[FilecoinUpload] Indexer mismatch:', event.data.error.message)
                updateStepState('announcing-cids', {
                  status: 'error',
                  progress: 0,
                  error: INPI_ERROR_MESSAGE,
                })
                break
              }

              case 'ipniProviderResults:failed': {
                console.warn('[FilecoinUpload] IPNI check failed:', event.data.error.message)
                updateStepState('announcing-cids', {
                  status: 'error',
                  progress: 0,
                  error: INPI_ERROR_MESSAGE,
                })
                break
              }

              case 'ipniProviderResults:complete': {
                console.debug('[FilecoinUpload] IPNI check succeeded')
                updateStepState('announcing-cids', { status: 'completed', progress: 100 })
                break
              }

              default:
                break
            }
          },
        }

        const walletAddress = storageScope ?? (wallet?.status === 'ready' ? wallet.data.address : null)
        const storedDataSetIds =
          debugParams.providerId == null && walletAddress ? getStoredDataSetIds(walletAddress) : []
        const executeFundedUpload = async (options: UploadExecutionOptions) => {
          const contexts = await prepareUploadContexts(synapse, BigInt(carResult.carBytes.length), options)
          updateStepState('checking-readiness', { status: 'completed', progress: 100 })
          updateStepState('uploading-car', { status: 'in-progress', progress: 0 })
          const executionOptions = { ...options, contexts }
          // Targeting has already been resolved and quoted. The SDK rejects
          // selectors together with explicit contexts and would otherwise select twice.
          delete executionOptions.dataSetIds
          delete executionOptions.providerIds
          delete executionOptions.copies
          delete executionOptions.excludeProviderIds
          return executeUpload(synapse, carResult.carBytes, carResult.rootCid, executionOptions)
        }

        // Select providers directly from the registry and create fresh
        // per-browser datasets during the upload commit, skipping the SDK's
        // smart-select (which enumerates every dataset on the shared demo
        // wallet). Falls back to smart-select with per-browser metadata when
        // no provider is reachable. The created dataset ids are stored on
        // `piecesConfirmed`, so later uploads take the resume path.
        const uploadIntoFreshDataSets = async (): Promise<UploadExecutionResult> => {
          let contexts: Awaited<ReturnType<typeof createFreshUploadContexts>> | null = null
          try {
            contexts = await createFreshUploadContexts(synapse, getOrCreateClientId())
            for (const context of contexts) {
              const provider = context.provider
              setUploadState((prev) => ({
                ...prev,
                providersById: { ...prev.providersById, [String(provider.id)]: provider },
              }))
            }
          } catch (error) {
            console.warn('[FilecoinUpload] Fresh context selection failed, falling back to smart-select:', error)
          }
          return executeFundedUpload(
            contexts == null
              ? { ...baseOptions, metadata: { clientId: getOrCreateClientId() } }
              : { ...baseOptions, contexts }
          )
        }

        let result: UploadExecutionResult
        if (debugParams.providerId != null) {
          result = await executeFundedUpload({
            ...baseOptions,
            providerIds: [debugParams.providerId],
            metadata: { clientId: getOrCreateClientId() },
          })
        } else if (walletAddress != null && storedDataSetIds.length > 0) {
          // Resume into this browser's known datasets. Passing explicit ids
          // skips the SDK's smart-select, which enumerates every dataset on
          // the shared demo wallet (one eth_call per dataset, unbounded).
          try {
            result = await executeFundedUpload({
              ...baseOptions,
              dataSetIds: storedDataSetIds.map((id) => BigInt(id)),
            })
          } catch (error) {
            // Recoverable failures, both safe to retry into fresh datasets:
            //   1. Resolution failed: the stored id is gone or owned by another
            //      wallet. Resolution emits no progress events, so
            //      sawUploadProgress is still false.
            //   2. The dataset resolved but its provider is unreachable: a
            //      StoreError before any bytes landed. Dataset resolution reads
            //      chain and registry state without contacting the provider, so
            //      an unreachable provider first surfaces at store time.
            //      Recreating datasets routes the upload to a reachable provider.
            const resolutionFailure = !sawUploadProgress && isDataSetResolutionError(error)
            const deadProviderOnResume = !sawBytesStored && isProviderStoreError(error)
            if (!resolutionFailure && !deadProviderOnResume) throw error
            console.warn('[FilecoinUpload] Stored dataset ids unusable, recreating data sets:', error)
            clearStoredDataSetIds(walletAddress)
            result = await uploadIntoFreshDataSets()
          }
        } else {
          // First upload from this browser
          result = await uploadIntoFreshDataSets()
        }
        logger.info('Upload completed')

        setUploadState((prev) => ({
          ...prev,
          copies: result.copies,
          network: wallet.status === 'ready' ? wallet.data.network || result.network : result.network,
        }))

        return rootCid
      } catch (error) {
        console.error('[FilecoinUpload] Upload failed with error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        setUploadState((prev) => ({
          ...prev,
          error: errorMessage,
          stepStates: prev.stepStates.map((step) =>
            step.status === 'in-progress' ? { ...step, status: 'error', error: errorMessage } : step
          ),
        }))
        throw error
      } finally {
        setUploadState((prev) => ({
          ...prev,
          isUploading: false,
        }))
      }
    },
    [updateStepState, synapseRef, wallet, addDataSetId, debugParams, storageScope, ensurePermissions]
  )

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      stepStates: INITIAL_STEP_STATES,
      transactionHashes: [],
      confirmedCopies: 0,
      expectedCopies: 0,
      currentCid: undefined,
      pieceCid: undefined,
      transactionHash: undefined,
      copies: undefined,
      providersById: {},
      network: undefined,
    })
  }, [])

  return {
    uploadState,
    uploadFile,
    resetUpload,
  }
}
