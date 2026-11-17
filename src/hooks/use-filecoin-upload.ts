import { CommitError, type PDPProvider, StoreError } from '@filoz/synapse-sdk'
import { checkFILBalance, validateGasRequirement } from 'filecoin-pin/core/payments'
import { createCarFromFile } from 'filecoin-pin/core/unixfs'
import { executeUpload, type UploadExecutionOptions, type UploadExecutionResult } from 'filecoin-pin/core/upload'
import pino from 'pino'
import prettyBytes from 'pretty-bytes'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_FILE_SIZE } from '../constants/files.ts'
import { DEFAULT_STORAGE_COPIES } from '../lib/filecoin-pin/config.ts'
import { acquireContentLock } from '../lib/filecoin-pin/content-lock.ts'
import { driveMetadataLabel, validateDriveMetadata } from '../lib/filecoin-pin/drive-metadata.ts'
import { buildEncryptedPayload, wrapCarPayload } from '../lib/filecoin-pin/encrypted-payload.ts'
import { encryptCar, encryptedDataSetMetadata } from '../lib/filecoin-pin/encryption.ts'
import { createFreshUploadContexts } from '../lib/filecoin-pin/fresh-contexts.ts'
import { ensureSessionKeyPermissions } from '../lib/filecoin-pin/synapse.ts'
import type { UploadProviderCheckpoint } from '../lib/filecoin-pin/upload-checkpoint.ts'
import { prepareUploadContexts, UploadFundingRequired } from '../lib/filecoin-pin/upload-funding.ts'
import { prepareUploadInput } from '../lib/filecoin-pin/upload-input.ts'
import { isDirectoryUpload, type UploadSource } from '../lib/filecoin-pin/upload-source.ts'
import { getOrCreateClientId } from '../lib/local-storage/client-id.ts'
import { addStoredDataSetId, clearStoredDataSetIds, getStoredDataSetIds } from '../lib/local-storage/data-set.ts'
import { requireDirectoryLocks } from '../lib/local-storage/directory-store.ts'
import { getCachedPieces } from '../lib/local-storage/piece-cache.ts'
import type { StepState } from '../types/upload/step.ts'
import { hasRemovalProgress, isDeletionScheduled } from '../utils/file-deletion.ts'
import { classifyUploadFailure, type UploadFailureCode, UploadSetupError } from '../utils/upload/upload-readiness.ts'
import { useFilecoinPinContext } from './use-filecoin-pin-context.ts'
import { useWaitableRef } from './use-waitable-ref.ts'

export interface UploadState {
  uploadProviders?: UploadProviderCheckpoint[]
  isDirectory?: boolean
  importedCar?: boolean
  confirmedPieces?: { dataSetId: bigint; providerId: bigint; pieceId: bigint; transactionHash: string }[]
  isUploading: boolean
  stepStates: StepState[]
  error?: string
  errorCode?: UploadFailureCode
  funding?: { depositNeeded: string; needsApproval: boolean }
  currentCid?: string
  /** Plaintext root CID inside the encrypted envelope; the stable content identity. `currentCid` stays the public envelope root. */
  contentRootCid?: string
  /** True once the upload's bytes are an FEE envelope (always, uploads are encrypted by default). */
  encrypted?: boolean
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
 * - Packs files or imports existing CAR archives in-browser
 * - Checks upload readiness (allowances, balances)
 * - Executes the upload with progress callbacks
 * - Tracks IPNI availability and on-chain confirmation
 */
export const useFilecoinUpload = (retainLockForDirectory = false) => {
  const contentLock = useRef<(() => void) | null>(null)
  const releaseUploadLock = useCallback(() => {
    contentLock.current?.()
    contentLock.current = null
  }, [])
  useEffect(() => releaseUploadLock, [releaseUploadLock])
  const { synapse, wallet, addDataSetId, debugParams, storageScope, ensurePermissions, encryption } =
    useFilecoinPinContext()

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
    async (file: UploadSource, metadata?: Record<string, string>): Promise<string> => {
      // Freeze the network before any asynchronous upload or balance refresh.
      const network = wallet.status === 'ready' ? wallet.data.network : undefined
      setUploadState({
        network,
        isUploading: true,
        stepStates: INITIAL_STEP_STATES,
        transactionHashes: [],
        confirmedCopies: 0,
        expectedCopies: 0,
        providersById: {},
        confirmedPieces: [],
        uploadProviders: [],
      })

      let confirmed = false
      try {
        if (network !== 'mainnet' && network !== 'calibration')
          throw new Error('Wait for wallet setup to finish before uploading.')
        if (file.size > MAX_FILE_SIZE)
          throw new Error(`Files must be ${prettyBytes(MAX_FILE_SIZE)} or smaller for browser uploads.`)
        const folderPath = validateDriveMetadata(file.name, metadata?.path ?? '', isDirectoryUpload(file))
        requireDirectoryLocks()
        updateStepState('creating-car', { status: 'in-progress', progress: 0 })
        logger.info('Preparing IPFS input')

        const carResult = await prepareUploadInput(file, {
          onProgress: (bytesProcessed: number, totalBytes: number) => {
            const progressPercent = Math.round((bytesProcessed / totalBytes) * 100)
            updateStepState('creating-car', { progress: progressPercent })
          },
        })

        if (carResult.isDirectory && carResult.carBytes.length > MAX_FILE_SIZE)
          throw new Error('The packed folder exceeds the 200 MB browser upload limit.')

        // Encryption is never silently skipped: without a usable credential the
        // upload is blocked, exactly like an unauthorized session.
        if (!encryption.ready)
          throw new UploadSetupError('encryption', 'Add your encryption key in Wallet setup before uploading.')
        const dataSetMetadata = encryptedDataSetMetadata(encryption.credential)
        // Plaintext payload (filecoin-pin wire profile: metadata-first CAR under
        // an anonymous wrapper directory, so the CLI and the share viewer unpack
        // it) -> FEE envelope -> outer CAR holding the envelope as one UnixFS
        // file. The outer root is the public identity (on-chain, IPNI,
        // providers); the payload root never leaves the ciphertext.
        const payload = carResult.importedCar
          ? await buildEncryptedPayload({ kind: 'car', carBytes: carResult.carBytes, name: file.name })
          : await wrapCarPayload(carResult, file.name)
        const envelope = await encryptCar(encryption.sessionPrivateKey, encryption.credential, payload.carBytes)
        const outerCar = await createCarFromFile(new File([envelope as BlobPart], 'encrypted.fee'))
        // Packing + the envelope + the outer wrapper add real overhead on top of
        // the plaintext the earlier checks measured; verify what's actually
        // about to upload, not just the input that produced it.
        if (outerCar.carBytes.length > MAX_FILE_SIZE)
          throw new Error('The encrypted upload exceeds the 200 MB browser upload limit.')
        const innerRoot = payload.rootCid
        const rootCid = outerCar.rootCid.toString()
        setUploadState((prev) => ({
          ...prev,
          currentCid: rootCid,
          contentRootCid: innerRoot,
          encrypted: true,
          importedCar: carResult.importedCar,
          isDirectory: carResult.isDirectory,
        }))

        updateStepState('creating-car', { status: 'completed', progress: 100 })
        logger.info('IPFS data prepared')

        // Lock and dedup key on the inner root: fresh salt makes the outer root
        // differ on every upload of identical plaintext.
        contentLock.current = await acquireContentLock(
          storageScope ??
            `${network === 'mainnet' ? 314 : 314159}:${wallet.status === 'ready' ? wallet.data.address.toLowerCase() : ''}`,
          innerRoot
        )

        if (
          storageScope &&
          getCachedPieces(storageScope)?.some((piece) => {
            if (piece.id === metadata?.taskId) return false
            const recordRoot = piece.contentRootCid ?? piece.cid
            return (
              ((!recordRoot || recordRoot === innerRoot) && hasRemovalProgress(piece) && !isDeletionScheduled(piece)) ||
              (recordRoot === innerRoot &&
                piece.upload &&
                piece.upload.phase !== 'complete' &&
                piece.upload.phase !== 'failed' &&
                piece.upload.phase !== 'funding')
            )
          })
        )
          throw new Error(
            'This content has an unfinished deletion or upload. Check its status before uploading it again.'
          )

        updateStepState('checking-readiness', { status: 'in-progress', progress: 0 })
        logger.info('Waiting for synapse to be initialized')
        const synapse = await synapseRef.wait()
        logger.info('Synapse initialized')
        // Session-key permission checks are deferred from page load to here so
        // read-only visits make no permission-related RPC calls.
        await (ensurePermissions ? ensurePermissions() : ensureSessionKeyPermissions())
        updateStepState('checking-readiness', { progress: 50 })

        const gas = await checkFILBalance(synapse)
        const gasCheck = validateGasRequirement(gas.balance, gas.isCalibnet)
        if (!gasCheck.isValid)
          throw new UploadSetupError('gas', gasCheck.errorMessage ?? 'Insufficient FIL for transaction fees.')

        logger.info('Uploading CAR to Synapse')
        // Distinguishes resolution failures (safe to retry into fresh data
        // sets) from errors after the upload started.
        let sawUploadProgress = false
        // Set once the primary copy's bytes land on a provider. Past this point
        // a store or commit failure reflects a problem mid-upload, so the
        // resume retry below leaves the stored dataset ids in place.
        let sawBytesStored = false
        const transactionsByProvider = new Map<string, string>()
        // First authoritative indexing signal; later announce failures never downgrade it.
        let announceConfirmed = false
        let executionContexts: Awaited<ReturnType<typeof prepareUploadContexts>> = []
        const baseOptions: UploadExecutionOptions = {
          logger,
          contextId: `upload-${Date.now()}`,
          pieceMetadata: {
            label: driveMetadataLabel(file.name, carResult.isDirectory),
            [carResult.importedCar ? 'carPath' : 'path']: folderPath,
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
                  uploadProviders: prev.uploadProviders?.map((provider) =>
                    provider.providerId === String(event.data.providerId) ? { ...provider, stored: true } : provider
                  ),
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
                const context = executionContexts.find((entry) => entry.provider.id === event.data.providerId)
                setUploadState((prev) => ({
                  ...prev,
                  uploadProviders: prev.uploadProviders?.map((provider) =>
                    provider.providerId === String(event.data.providerId)
                      ? {
                          ...provider,
                          dataSetId: context?.dataSetId?.toString() ?? provider.dataSetId,
                          transactionHash: event.data.txHash,
                        }
                      : provider
                  ),
                }))
                const txHash = event.data.txHash
                transactionsByProvider.set(String(event.data.providerId), txHash)
                console.debug('[FilecoinUpload] Piece add transaction:', { txHash })
                setUploadState((prev) => {
                  const newHashes = txHash ? [...prev.transactionHashes, txHash] : prev.transactionHashes
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
                    stepStates,
                  }
                })
                updateStepState('finalizing-transaction', { status: 'in-progress', progress: 0 })
                break
              }

              case 'piecesConfirmed': {
                confirmed = true
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

              case 'pieceSyncStatus:providerSynced': {
                console.debug('[FilecoinUpload] Advertisement confirmed indexed on provider:', event.data.serviceURL)
                announceConfirmed = true
                updateStepState('announcing-cids', { status: 'completed', progress: 100 })
                break
              }

              case 'pieceSyncStatus:failed': {
                console.warn('[FilecoinUpload] Piece sync check failed:', event.data.error.message)
                if (!announceConfirmed) {
                  updateStepState('announcing-cids', {
                    status: 'error',
                    progress: 0,
                    error: INPI_ERROR_MESSAGE,
                  })
                }
                break
              }

              case 'indexingConfirmation:mismatch': {
                console.warn('[FilecoinUpload] Indexer mismatch:', event.data.error.message)
                if (!announceConfirmed) {
                  updateStepState('announcing-cids', {
                    status: 'error',
                    progress: 0,
                    error: INPI_ERROR_MESSAGE,
                  })
                }
                break
              }

              case 'ipniProviderResults:failed': {
                console.warn('[FilecoinUpload] IPNI check failed:', event.data.error.message)
                if (!announceConfirmed) {
                  updateStepState('announcing-cids', {
                    status: 'error',
                    progress: 0,
                    error: INPI_ERROR_MESSAGE,
                  })
                }
                break
              }

              case 'ipniProviderResults:complete': {
                console.debug('[FilecoinUpload] IPNI check succeeded')
                announceConfirmed = true
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
        let uploadExecutionStarted = false
        const executeFundedUpload = async (options: UploadExecutionOptions) => {
          uploadExecutionStarted = false
          const contexts = await prepareUploadContexts(synapse, BigInt(outerCar.carBytes.length), options)
          executionContexts = contexts
          setUploadState((prev) => ({
            ...prev,
            expectedCopies: contexts.length,
            uploadProviders: contexts.map((context) => ({
              providerId: String(context.provider.id),
              serviceURL: context.provider.pdp?.serviceURL ?? '',
              dataSetId: context.dataSetId?.toString(),
            })),
            providersById: {
              ...prev.providersById,
              ...Object.fromEntries(contexts.map((context) => [String(context.provider.id), context.provider])),
            },
          }))
          updateStepState('checking-readiness', { status: 'completed', progress: 100 })
          updateStepState('uploading-car', { status: 'in-progress', progress: 0 })
          const executionOptions = { ...options, contexts }
          // Targeting has already been resolved and quoted. The SDK rejects
          // selectors together with explicit contexts and would otherwise select twice.
          delete executionOptions.dataSetIds
          delete executionOptions.providerIds
          delete executionOptions.copies
          delete executionOptions.excludeProviderIds
          uploadExecutionStarted = true
          return executeUpload(synapse, outerCar.carBytes, outerCar.rootCid, executionOptions)
        }

        // Select providers directly from the registry and create fresh
        // per-browser datasets during the upload commit, skipping the SDK's
        // smart-select (which enumerates every dataset the wallet owns). Falls back to smart-select with per-browser metadata when
        // no provider is reachable. The created dataset ids are stored on
        // `piecesConfirmed`, so later uploads take the resume path.
        const uploadIntoFreshDataSets = async (): Promise<UploadExecutionResult> => {
          let contexts: Awaited<ReturnType<typeof createFreshUploadContexts>> | null = null
          try {
            contexts = await createFreshUploadContexts(
              synapse,
              getOrCreateClientId(),
              DEFAULT_STORAGE_COPIES,
              [],
              dataSetMetadata
            )
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
              ? { ...baseOptions, metadata: { clientId: getOrCreateClientId(), ...dataSetMetadata } }
              : { ...baseOptions, contexts }
          )
        }

        let result: UploadExecutionResult
        if (debugParams.providerId != null) {
          result = await executeFundedUpload({
            ...baseOptions,
            providerIds: [debugParams.providerId],
            metadata: { clientId: getOrCreateClientId(), ...dataSetMetadata },
          })
        } else if (walletAddress != null && storedDataSetIds.length > 0) {
          // Resume into this browser's known datasets. Passing explicit ids
          // skips the SDK's smart-select, which enumerates every dataset on
          // a large wallet (one eth_call per dataset).
          try {
            result = await executeFundedUpload({
              ...baseOptions,
              dataSetIds: storedDataSetIds.map((id) => BigInt(id)),
              // Resumed data sets already carry their metadata (immutable); a
              // partial resume can still create fresh ones, which must be
              // marked encrypted like every other creation path.
              metadata: dataSetMetadata,
            })
          } catch (error) {
            // Resolution/quote reads already distinguish dead datasets from
            // unavailable chain state; never clear candidates for these errors.
            if (!uploadExecutionStarted) throw error
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
        confirmed ||= result.copies.length > 0
        logger.info('Upload completed')

        // The SDK resolves once all attempts settle, even if only some copies
        // succeeded. Failed commits will never emit another piecesConfirmed.
        setUploadState((prev) => {
          const copies = result.copies
          const expectedCopies = Math.max(
            debugParams.providerId == null ? DEFAULT_STORAGE_COPIES : 1,
            result.requestedCopies ?? prev.expectedCopies,
            copies.length
          )
          const reduced = copies.length < expectedCopies
          return {
            ...prev,
            copies,
            expectedCopies,
            confirmedCopies: copies.length,
            stepStates: prev.stepStates.map((step) => {
              if (step.step === 'finalizing-transaction')
                return { ...step, status: 'completed' as const, progress: 100 }
              if (step.step === 'replicating')
                return {
                  ...step,
                  status: reduced ? ('error' as const) : ('completed' as const),
                  progress: 100,
                  error: reduced ? `Stored with ${copies.length} of ${expectedCopies} storage copies.` : undefined,
                }
              return step
            }),
          }
        })

        return rootCid
      } catch (error) {
        if (!(error instanceof UploadFundingRequired))
          console.error('[FilecoinUpload] Upload failed with error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        setUploadState((prev) => ({
          ...prev,
          error: errorMessage,
          errorCode: error instanceof UploadSetupError ? error.code : classifyUploadFailure(errorMessage),
          expectedCopies: error instanceof UploadFundingRequired ? error.copies : prev.expectedCopies,
          funding:
            error instanceof UploadFundingRequired
              ? { depositNeeded: error.depositNeeded.toString(), needsApproval: error.needsApproval }
              : undefined,
          stepStates: prev.stepStates.map((step) =>
            step.status === 'in-progress'
              ? { ...step, status: error instanceof UploadFundingRequired ? 'pending' : 'error', error: errorMessage }
              : step
          ),
        }))
        throw error
      } finally {
        if (!retainLockForDirectory || !confirmed) releaseUploadLock()
        setUploadState((prev) => ({
          ...prev,
          isUploading: false,
        }))
      }
    },
    [
      updateStepState,
      synapseRef,
      wallet,
      addDataSetId,
      debugParams,
      storageScope,
      encryption,
      ensurePermissions,
      retainLockForDirectory,
      releaseUploadLock,
    ]
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
    releaseUploadLock,
  }
}
