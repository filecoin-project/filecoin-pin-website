import type { DriveNetwork } from '../filecoin-pin/browser-wallet.ts'
import { DEFAULT_NETWORK } from '../filecoin-pin/config.ts'

const NETWORK_KEY = 'filecoin-drive-network'

export function readNetworkPreference(): DriveNetwork {
  try {
    const saved = localStorage.getItem(NETWORK_KEY)
    if (saved === 'calibration') {
      // The current UI has no switcher; migrate its old testnet selection on startup.
      saveNetworkPreference('mainnet')
      return 'mainnet'
    }
    return saved === 'mainnet' ? saved : DEFAULT_NETWORK
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
