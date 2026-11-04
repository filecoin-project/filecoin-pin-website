export type WalletPreference = { type: 'injected'; rdns?: string } | { type: 'walletconnect' }

const WALLET_KEY = 'filecoin-drive-wallet'

export function readWalletPreference(): WalletPreference | null {
  try {
    const saved = JSON.parse(localStorage.getItem(WALLET_KEY) ?? 'null')
    if (saved?.type === 'walletconnect') return { type: 'walletconnect' }
    if (saved?.type === 'injected' && (saved.rdns === undefined || typeof saved.rdns === 'string'))
      return { type: 'injected', ...(saved.rdns ? { rdns: saved.rdns } : {}) }
  } catch {
    // Missing or inaccessible preferences require an explicit connection.
  }
  return null
}

export function saveWalletPreference(wallet: WalletPreference | null) {
  try {
    if (wallet) localStorage.setItem(WALLET_KEY, JSON.stringify(wallet))
    else localStorage.removeItem(WALLET_KEY)
  } catch {
    // Connecting still works for this visit when preferences cannot be saved.
  }
}
