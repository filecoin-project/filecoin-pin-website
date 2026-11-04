import type { DriveNetwork } from '../filecoin-pin/browser-wallet.ts'
import { DEFAULT_NETWORK } from '../filecoin-pin/config.ts'

const NETWORK_KEY = 'filecoin-drive-network'

export function readNetworkPreference(): DriveNetwork {
  try {
    const saved = localStorage.getItem(NETWORK_KEY)
    return saved === 'mainnet' || saved === 'calibration' ? saved : DEFAULT_NETWORK
  } catch {
    return DEFAULT_NETWORK
  }
}

export function saveNetworkPreference(network: DriveNetwork) {
  try {
    localStorage.setItem(NETWORK_KEY, network)
  } catch {
    // The selected network still works for this page when storage is unavailable.
  }
}
