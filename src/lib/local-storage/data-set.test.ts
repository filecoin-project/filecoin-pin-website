import { beforeEach, describe, expect, it } from 'vitest'
import { addStoredDataSetId, getStoredDataSetIds, storeDataSetId } from './data-set.ts'

const WALLET = '0xabc'

describe('local-storage/data-set', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when nothing is stored', () => {
    expect(getStoredDataSetIds(WALLET)).toEqual([])
  })

  it('migrates a legacy single-id entry into the multi-id read', () => {
    storeDataSetId(WALLET, 42)
    expect(getStoredDataSetIds(WALLET)).toEqual([42])
  })

  it('addStoredDataSetId is idempotent', () => {
    addStoredDataSetId(WALLET, 7)
    addStoredDataSetId(WALLET, 7)
    expect(getStoredDataSetIds(WALLET)).toEqual([7])
  })

  it('addStoredDataSetId accumulates distinct ids in order', () => {
    addStoredDataSetId(WALLET, 1)
    addStoredDataSetId(WALLET, 2)
    addStoredDataSetId(WALLET, 3)
    expect(getStoredDataSetIds(WALLET)).toEqual([1, 2, 3])
  })

  it('keeps wallets isolated', () => {
    addStoredDataSetId('0xaaa', 100)
    addStoredDataSetId('0xbbb', 200)
    expect(getStoredDataSetIds('0xaaa')).toEqual([100])
    expect(getStoredDataSetIds('0xbbb')).toEqual([200])
  })

  it('never resumes into pre-encryption data sets: ids stored by older builds are invisible', () => {
    // Pre-encryption keys. Data-set metadata is immutable, so these can never
    // carry foc/enc: an encrypted upload resuming into them would be stored
    // correctly but scanned as public (mislabeled) forever.
    localStorage.setItem(`filecoin-pin-data-set-ids-v1-${WALLET}`, JSON.stringify([1832, 1833]))
    localStorage.setItem(`filecoin-pin-data-set-id-v2-${WALLET}`, '1832')
    expect(getStoredDataSetIds(WALLET)).toEqual([])
  })
})
