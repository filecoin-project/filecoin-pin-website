/** Map a Synapse `network` value to a human-friendly label. */
export const getNetworkLabel = (network?: string): string => {
  switch (network) {
    case 'mainnet':
      return 'Filecoin mainnet'
    case 'calibration':
      return 'Calibration testnet'
    default:
      return network ?? 'Calibration testnet'
  }
}
