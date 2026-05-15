import type { Meta, StoryObj } from '@storybook/react-vite'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilecoinPinContext, type FilecoinPinContextValue } from '../../context/filecoin-pin-provider.tsx'
import type { StepState } from '../../types/upload/step.ts'
import { ButtonBase } from '../ui/button/button-base.tsx'
import { UploadStatus } from './upload-status.tsx'

/**
 * Mock FilecoinPinContext value. UploadCompleted reads `dataSet` to derive
 * a fallback datasetId; we always pass datasetId explicitly so the hook's
 * value is harmless.
 */
const MOCK_CONTEXT: FilecoinPinContextValue = {
  wallet: { status: 'idle' },
  refreshWallet: async () => {
    /* noop */
  },
  synapse: null,
  dataSet: { status: 'idle' },
  checkIfDatasetExists: async () => [],
  addDataSetId: () => {
    /* noop */
  },
  debugParams: { providerId: null, dataSetId: null },
}

const FILE_NAME = 'demo-data.car'
const FILE_SIZE = '4.20 MB'
const ROOT_CID = 'bafybeigoflpi43gpwuf2i2srflxdkgtsxmvwqcrfruaceuju3kmlzoigzm'
const PIECE_CID = 'baga6ea4seaqfoztqwvslmx6ptxvzopg4g6n5do2br36exlo6ylsyu7akdcm5sdy'
const TX_HASHES = [
  '0xf85d7c38321ce4a4c3d0fac4a5347f20a2f9596da5120df28b1190ac0948ad77',
  '0xfb3d2a9b2aa5f83aca1f8235f8c5e215aa2cc1cb8e7c7a57f8b7e5d49f74e51d',
  '0x4b7d0124e5a1d2c398cba4fb3e8adf7a1c2ccc7ab9ca5559a53fba6d04d332ef',
]
const DATASET_IDS = ['101', '202', '303']
const PROVIDER_IDS = ['9', '12', '17']
const PROVIDER_NAMES = ['Hot Cargo Storage', 'Iron Vault SP', 'Cumulus Provider']
const SERVICE_URLS = [
  'https://pdp.hotcargo.example/sp',
  'https://pdp.ironvault.example/sp',
  'https://pdp.cumulus.example/sp',
]

type FailureMode = 'none' | 'replicating-failed' | 'ipni-failed'

interface FlowConfig {
  copies: number
  failureMode: FailureMode
  tickMs: number
  network: string
}

const INITIAL_STEPS: StepState[] = [
  { step: 'creating-car', progress: 0, status: 'pending' },
  { step: 'checking-readiness', progress: 0, status: 'pending' },
  { step: 'uploading-car', progress: 0, status: 'pending' },
  { step: 'replicating', progress: 0, status: 'pending' },
  { step: 'announcing-cids', progress: 0, status: 'pending' },
  { step: 'finalizing-transaction', progress: 0, status: 'pending' },
]

interface FlowState {
  stepStates: StepState[]
  cid?: string
  pieceCid?: string
  transactionHashes: string[]
  expectedCopies: number
  confirmedCopies: number
  copyCount?: number
  datasetIds?: string[]
  datasetId?: string
  providerIds?: string[]
  providerNames?: string[]
  serviceURLs?: string[]
  network?: string
}

const INITIAL_STATE: FlowState = {
  stepStates: INITIAL_STEPS,
  transactionHashes: [],
  expectedCopies: 0,
  confirmedCopies: 0,
}

/**
 * Sequence of state mutations representing a real upload flow.
 * Each tick is one `tickMs` interval. Pure data — exercises real
 * UploadStatus props pipeline without coupling to SDK.
 */
function buildScript(config: FlowConfig): Array<(s: FlowState) => FlowState> {
  const script: Array<(s: FlowState) => FlowState> = []
  const { copies, failureMode, network } = config

  // Set network early so finalizing-card title/links pick it up
  script.push((s) => ({ ...s, network }))

  // creating-car: 0 -> 100
  for (const p of [25, 50, 75, 100]) {
    script.push((s) => ({
      ...s,
      stepStates: setStep(s.stepStates, 'creating-car', {
        status: p === 100 ? 'completed' : 'in-progress',
        progress: p,
      }),
      cid: p === 100 ? ROOT_CID : s.cid,
    }))
  }

  // checking-readiness + uploading-car start
  script.push((s) => ({
    ...s,
    stepStates: setStep(
      setStep(s.stepStates, 'checking-readiness', { status: 'in-progress', progress: 50 }),
      'uploading-car',
      {
        status: 'in-progress',
        progress: 0,
      }
    ),
  }))
  script.push((s) => ({
    ...s,
    stepStates: setStep(
      setStep(s.stepStates, 'checking-readiness', { status: 'completed', progress: 100 }),
      'uploading-car',
      {
        status: 'in-progress',
        progress: 50,
      }
    ),
  }))

  // onStored: uploading-car complete, replicating in-progress, pieceCid available
  script.push((s) => ({
    ...s,
    pieceCid: PIECE_CID,
    stepStates: setStep(setStep(s.stepStates, 'uploading-car', { status: 'completed', progress: 100 }), 'replicating', {
      status: 'in-progress',
      progress: 0,
    }),
  }))

  // onCopyComplete or onCopyFailed
  if (copies >= 2) {
    if (failureMode === 'replicating-failed') {
      script.push((s) => ({
        ...s,
        stepStates: setStep(
          setStep(s.stepStates, 'replicating', {
            status: 'error',
            progress: 0,
            error: 'Secondary copy failed, file stored with reduced redundancy',
          }),
          'announcing-cids',
          { status: 'in-progress', progress: 0 }
        ),
      }))
    } else {
      script.push((s) => ({
        ...s,
        stepStates: setStep(
          setStep(s.stepStates, 'replicating', { status: 'completed', progress: 100 }),
          'announcing-cids',
          {
            status: 'in-progress',
            progress: 0,
          }
        ),
      }))
    }
  } else {
    // single-copy fallback path: no onCopyComplete; replicating done via onPiecesAdded fallback later
    script.push((s) => ({
      ...s,
      stepStates: setStep(s.stepStates, 'announcing-cids', { status: 'in-progress', progress: 0 }),
    }))
  }

  // onPiecesAdded × N (one per copy attempted)
  const piecesAddedCount = failureMode === 'replicating-failed' ? 1 : copies
  for (let i = 0; i < piecesAddedCount; i++) {
    script.push((s) => {
      const newHashes = [...s.transactionHashes, TX_HASHES[i] ?? TX_HASHES[0]]
      const newExpected = s.expectedCopies + 1
      const stepStates = setStep(
        s.stepStates.map((step) =>
          step.step === 'replicating' && step.status === 'in-progress'
            ? { ...step, status: 'completed' as const, progress: 100 }
            : step
        ),
        'finalizing-transaction',
        { status: 'in-progress', progress: 0 }
      )
      return { ...s, transactionHashes: newHashes, expectedCopies: newExpected, stepStates }
    })
  }

  // onPiecesConfirmed × N — accumulate per-copy data so the completed view
  // already has the full picture once isUploadSuccessful flips on.
  for (let i = 0; i < piecesAddedCount; i++) {
    script.push((s) => {
      const newConfirmed = s.confirmedCopies + 1
      const allConfirmed = newConfirmed >= s.expectedCopies && s.expectedCopies > 0
      const progress = Math.round((newConfirmed / Math.max(s.expectedCopies, 1)) * 100)
      const stepStates = setStep(s.stepStates, 'finalizing-transaction', {
        status: allConfirmed ? 'completed' : 'in-progress',
        progress,
      })
      const datasetIdForCopy = DATASET_IDS[i] ?? DATASET_IDS[0]
      const providerIdForCopy = PROVIDER_IDS[i] ?? PROVIDER_IDS[0]
      const providerNameForCopy = PROVIDER_NAMES[i] ?? PROVIDER_NAMES[0]
      const serviceUrlForCopy = SERVICE_URLS[i] ?? SERVICE_URLS[0]
      return {
        ...s,
        confirmedCopies: newConfirmed,
        stepStates,
        datasetId: s.datasetId ?? datasetIdForCopy,
        datasetIds: [...(s.datasetIds ?? []), datasetIdForCopy],
        providerIds: [...(s.providerIds ?? []), providerIdForCopy],
        providerNames: [...(s.providerNames ?? []), providerNameForCopy],
        serviceURLs: [...(s.serviceURLs ?? []), serviceUrlForCopy],
        copyCount: newConfirmed,
      }
    })
  }

  // IPNI announce result
  if (failureMode === 'ipni-failed') {
    script.push((s) => ({
      ...s,
      stepStates: setStep(s.stepStates, 'announcing-cids', {
        status: 'error',
        progress: 0,
        error: 'Could not verify IPNI announcement',
      }),
    }))
  } else {
    script.push((s) => ({
      ...s,
      stepStates: setStep(s.stepStates, 'announcing-cids', { status: 'completed', progress: 100 }),
    }))
  }

  return script
}

function setStep(steps: StepState[], name: StepState['step'], updates: Partial<StepState>): StepState[] {
  return steps.map((s) => (s.step === name ? ({ ...s, ...updates } as StepState) : s))
}

interface WalkthroughProps {
  copies: 1 | 2 | 3
  failureMode: FailureMode
  autoPlay: boolean
  tickMs: number
  network: 'calibration' | 'mainnet'
}

function Walkthrough({ copies, failureMode, autoPlay, tickMs, network }: WalkthroughProps) {
  const config = useMemo<FlowConfig>(
    () => ({ copies, failureMode, tickMs, network }),
    [copies, failureMode, tickMs, network]
  )
  const script = useMemo(() => buildScript(config), [config])

  const [state, setState] = useState<FlowState>(INITIAL_STATE)
  const [tick, setTick] = useState(0)
  const [running, setRunning] = useState(autoPlay)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const advance = useCallback(() => {
    setTick((t) => {
      if (t >= script.length) return t
      setState((s) => script[t](s))
      return t + 1
    })
  }, [script])

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setState(INITIAL_STATE)
    setTick(0)
    setRunning(autoPlay)
  }, [autoPlay])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reset` identity only changes with `autoPlay`; `script` is needed in deps so config changes (copies/failureMode/tickMs/network) re-trigger the reset.
  useEffect(() => {
    reset()
  }, [reset, script])

  // Auto-play timer
  useEffect(() => {
    if (!running || tick >= script.length) return
    timerRef.current = setTimeout(advance, tickMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [running, tick, script.length, advance, tickMs])

  const done = tick >= script.length

  return (
    <FilecoinPinContext.Provider value={MOCK_CONTEXT}>
      <div className="space-y-4 max-w-2xl">
        <div className="flex gap-2 items-center text-sm text-zinc-300">
          <ButtonBase onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Play'}</ButtonBase>
          <ButtonBase onClick={advance}>Step</ButtonBase>
          <ButtonBase onClick={reset}>Reset</ButtonBase>
          <span>
            Tick {tick} / {script.length} {done ? '(done)' : ''}
          </span>
        </div>
        <UploadStatus
          cid={state.cid}
          confirmedCopies={state.confirmedCopies}
          copyCount={state.copyCount}
          datasetId={state.datasetId}
          datasetIds={state.datasetIds}
          expectedCopies={state.expectedCopies}
          fileName={FILE_NAME}
          fileSize={FILE_SIZE}
          isExpanded={true}
          pieceCid={state.pieceCid}
          providerIds={state.providerIds}
          providerNames={state.providerNames}
          serviceURLs={state.serviceURLs}
          stepStates={state.stepStates}
          transactionHash={state.transactionHashes[0] ?? ''}
          transactionHashes={state.transactionHashes}
          uploadNetwork={state.network}
        />
      </div>
    </FilecoinPinContext.Provider>
  )
}

const meta = {
  title: 'Upload/UploadFlowWalkthrough',
  component: Walkthrough,
  parameters: { layout: 'padded' },
  argTypes: {
    copies: { control: { type: 'inline-radio' }, options: [1, 2, 3] },
    failureMode: { control: { type: 'inline-radio' }, options: ['none', 'replicating-failed', 'ipni-failed'] },
    autoPlay: { control: 'boolean' },
    tickMs: { control: { type: 'number', min: 100, max: 3000, step: 100 } },
    network: { control: { type: 'inline-radio' }, options: ['calibration', 'mainnet'] },
  },
} satisfies Meta<typeof Walkthrough>

export default meta
type Story = StoryObj<typeof meta>

export const HappyPath2x: Story = {
  args: { copies: 2, failureMode: 'none', autoPlay: true, tickMs: 600, network: 'calibration' },
}

export const HappyPath3x: Story = {
  args: { copies: 3, failureMode: 'none', autoPlay: true, tickMs: 600, network: 'calibration' },
}

export const ReplicationDegraded: Story = {
  args: { copies: 2, failureMode: 'replicating-failed', autoPlay: true, tickMs: 600, network: 'calibration' },
}

export const IpniAnnounceFailed: Story = {
  args: { copies: 2, failureMode: 'ipni-failed', autoPlay: true, tickMs: 600, network: 'calibration' },
}

export const SingleCopy: Story = {
  args: { copies: 1, failureMode: 'none', autoPlay: true, tickMs: 600, network: 'calibration' },
}

export const ManualStep: Story = {
  args: { copies: 2, failureMode: 'none', autoPlay: false, tickMs: 600, network: 'calibration' },
}

export const Mainnet: Story = {
  args: { copies: 2, failureMode: 'none', autoPlay: true, tickMs: 600, network: 'mainnet' },
}
