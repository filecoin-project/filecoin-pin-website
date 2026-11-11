import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ init: vi.fn(), connect: vi.fn(), theme: vi.fn() }))
vi.mock('@walletconnect/ethereum-provider', () => ({ EthereumProvider: { init: mocks.init } }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id')
  document.documentElement.dataset.theme = 'light'
  mocks.init.mockResolvedValue({ accounts: [], connect: mocks.connect, modal: { setThemeMode: mocks.theme } })
  mocks.connect.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('WalletConnect transport', () => {
  it('lazily initializes once with both Filecoin RPCs and requires the selected chain at pairing', async () => {
    const { connectWalletConnect } = await import('./wallet-connect.ts')
    expect(mocks.init).not.toHaveBeenCalled()
    await connectWalletConnect('calibration')
    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'test-project-id',
        chains: [314159],
        showQrModal: true,
        qrModalOptions: { themeMode: 'light' },
        optionalChains: [314, 314159],
        rpcMap: { 314: expect.any(String), 314159: expect.any(String) },
      })
    )
    expect(mocks.connect).toHaveBeenCalledWith({ chains: [314159], optionalChains: [314] })
    document.documentElement.dataset.theme = 'dark'
    await connectWalletConnect('mainnet')
    expect(mocks.theme).toHaveBeenLastCalledWith('dark')
    expect(mocks.init).toHaveBeenCalledOnce()
  })

  it('reuses a restored remote session instead of starting a new pairing', async () => {
    mocks.init.mockResolvedValue({ session: { topic: 'restored' }, accounts: [], connect: mocks.connect })
    const { connectWalletConnect } = await import('./wallet-connect.ts')
    await connectWalletConnect('mainnet')
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it('allows retrying failed initialization', async () => {
    mocks.init.mockRejectedValueOnce(new Error('relay unavailable'))
    const { getWalletConnectProvider } = await import('./wallet-connect.ts')
    await expect(getWalletConnectProvider()).rejects.toThrow('relay unavailable')
    await getWalletConnectProvider()
    expect(mocks.init).toHaveBeenCalledTimes(2)
  })
  it('uses Beck’s public project ID when no environment override is supplied', async () => {
    vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '')
    const { getWalletConnectProvider, walletConnectAvailable } = await import('./wallet-connect.ts')
    expect(walletConnectAvailable).toBe(true)
    await getWalletConnectProvider()
    expect(mocks.init).toHaveBeenCalledWith(expect.objectContaining({ projectId: '6d8b88b03b08df309b5258ff3de372be' }))
  })
})

it('silently restores an approved remote account without pairing or requesting a network change', async () => {
  const account = '0x1111111111111111111111111111111111111111'
  const request = vi.fn()
  mocks.init.mockResolvedValue({
    session: {
      expiry: Math.floor(Date.now() / 1000) + 3600,
      namespaces: { eip155: { accounts: [`eip155:314159:${account}`] } },
    },
    connect: mocks.connect,
    request,
  })
  const { restoreWalletConnect } = await import('./wallet-connect.ts')
  expect((await restoreWalletConnect('calibration'))?.address).toBe(account)
  expect(await restoreWalletConnect('mainnet')).toBeNull()
  expect(request).not.toHaveBeenCalled()
  expect(mocks.connect).not.toHaveBeenCalled()
})

it.each([undefined, { expiry: 1, namespaces: {} }])(
  'never starts pairing for a missing or expired remote session',
  async (session) => {
    mocks.init.mockResolvedValue({ session, connect: mocks.connect })
    const { restoreWalletConnect } = await import('./wallet-connect.ts')
    expect(await restoreWalletConnect('mainnet')).toBeNull()
    expect(mocks.connect).not.toHaveBeenCalled()
  }
)
