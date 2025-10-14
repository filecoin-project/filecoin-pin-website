import type {
  CALIBRATION_LABEL_FIL,
  CALIBRATION_LABEL_USDFC,
  MAINNET_LABEL_FIL,
  MAINNET_LABEL_USDFC,
} from '../constants/network.ts'

export type NetworkType = 'calibration' | 'mainnet'

export type FilLabel = typeof CALIBRATION_LABEL_FIL | typeof MAINNET_LABEL_FIL
export type UsdfcLabel = typeof CALIBRATION_LABEL_USDFC | typeof MAINNET_LABEL_USDFC
