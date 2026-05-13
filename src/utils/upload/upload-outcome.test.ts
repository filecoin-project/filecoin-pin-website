import { describe, expect, it } from 'vitest'
import type { StepState } from '../../types/upload/step.ts'
import { getUploadOutcome } from './upload-outcome.ts'

const ROOT_CID = 'bafybeigoflpi43gpwuf2i2srflxdkgtsxmvwqcrfruaceuju3kmlzoigzm'

const completed: StepState[] = [
  { step: 'creating-car', status: 'completed', progress: 100 },
  { step: 'checking-readiness', status: 'completed', progress: 100 },
  { step: 'uploading-car', status: 'completed', progress: 100 },
  { step: 'replicating', status: 'completed', progress: 100 },
  { step: 'announcing-cids', status: 'completed', progress: 100 },
  { step: 'finalizing-transaction', status: 'completed', progress: 100 },
]

const withStep = (steps: StepState[], name: StepState['step'], updates: Partial<StepState>): StepState[] =>
  steps.map((s) => (s.step === name ? ({ ...s, ...updates } as StepState) : s))

describe('getUploadOutcome', () => {
  it('reports success when every step is completed and a cid is present', () => {
    const out = getUploadOutcome({ stepStates: completed, cid: ROOT_CID })
    expect(out).toEqual({
      isUploadSuccessful: true,
      isUploadFailure: false,
      hasIpniAnnounceFailure: false,
    })
  })

  it('still reports success when replicating ends in error (degraded multi-copy)', () => {
    const steps = withStep(completed, 'replicating', { status: 'error', error: 'secondary copy failed' })
    const out = getUploadOutcome({ stepStates: steps, cid: ROOT_CID })
    expect(out.isUploadSuccessful).toBe(true)
    expect(out.isUploadFailure).toBe(false)
  })

  it('still reports success when announcing-cids ends in error (IPNI miss)', () => {
    const steps = withStep(completed, 'announcing-cids', { status: 'error', error: 'IPNI not yet indexed' })
    const out = getUploadOutcome({ stepStates: steps, cid: ROOT_CID })
    expect(out.isUploadSuccessful).toBe(true)
    expect(out.hasIpniAnnounceFailure).toBe(true)
  })

  it('reports both replicating and announcing-cids errors as success when other steps complete', () => {
    const steps = withStep(withStep(completed, 'replicating', { status: 'error' }), 'announcing-cids', {
      status: 'error',
    })
    const out = getUploadOutcome({ stepStates: steps, cid: ROOT_CID })
    expect(out.isUploadSuccessful).toBe(true)
    expect(out.hasIpniAnnounceFailure).toBe(true)
  })

  it('reports failure when a non-soft step errors', () => {
    const steps = withStep(completed, 'uploading-car', { status: 'error', error: 'network died' })
    const out = getUploadOutcome({ stepStates: steps, cid: ROOT_CID })
    expect(out.isUploadFailure).toBe(true)
    expect(out.isUploadSuccessful).toBe(false)
  })

  it('reports neither success nor failure mid-flight', () => {
    const steps = withStep(completed, 'finalizing-transaction', { status: 'in-progress', progress: 50 })
    const out = getUploadOutcome({ stepStates: steps, cid: ROOT_CID })
    expect(out.isUploadSuccessful).toBe(false)
    expect(out.isUploadFailure).toBe(false)
  })

  it('refuses success when cid is missing even if all steps are completed', () => {
    const out = getUploadOutcome({ stepStates: completed, cid: undefined })
    expect(out.isUploadSuccessful).toBe(false)
  })
})
