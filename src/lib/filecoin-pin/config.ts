import type { DriveNetwork } from './browser-wallet.ts'

export const DEFAULT_NETWORK: DriveNetwork = 'mainnet'
export const DEFAULT_SESSION_DAYS = 7
export const DEFAULT_STORAGE_COPIES = 2
export const LOW_STORAGE_RUNWAY_DAYS = 7
export const MIN_UPLOAD_RUNWAY_EPOCHS = BigInt(LOW_STORAGE_RUNWAY_DAYS) * TIME_CONSTANTS.EPOCHS_PER_DAY

import { TIME_CONSTANTS } from '@filoz/synapse-core/utils'
