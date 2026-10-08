import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  receipt: vi.fn(),
  validate: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  remoteConnect: vi.fn(),
  remoteDisconnect: vi.fn(),
}))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/filecoin-pin/browser-wallet.ts')>()),
  ownerClient: () => ({ writeContract: mocks.write }),
  publicClient: () => ({ waitForTransactionReceipt: mocks.receipt }),
  browserSynapse: () => ({ validate: mocks.validate, expiresAt: () => Math.floor(Date.now() / 1000) + 7 * 86400 }),
}))
vi.mock('../lib/local-storage/session-vault.ts', () => ({
  loadBrowserSession: mocks.load,
  saveBrowserSession: mocks.save,
}))
vi.mock('../lib/filecoin-pin/wallet-connect.ts', () => ({
  walletConnectAvailable: true,
  connectWalletConnect: mocks.remoteConnect,
}))

import { SessionPermissionError } from '../lib/filecoin-pin/browser-wallet.ts'
import { BrowserWalletProvider, useBrowserWallet } from './browser-wallet-provider.tsx'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const hash = `0x${'a'.repeat(64)}`
let accounts: string[]
let listeners: Map<string, (...args: unknown[]) => void>
let request: ReturnType<typeof vi.fn>
const wrapper = ({ children }: { children: ReactNode }) => <BrowserWalletProvider>{children}</BrowserWalletProvider>
beforeEach(() => {
  vi.clearAllMocks()
  accounts = [ALICE]
  listeners = new Map()
  request = vi.fn(async ({ method }) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return accounts
    return null
  })
  Object.defineProperty(window, 'ethereum', {
    configurable: true,
    value: {
      request,
      on: (name: string, handler: (...args: unknown[]) => void) => listeners.set(name, handler),
      removeListener: (name: string) => listeners.delete(name),
    },
  })
  mocks.load.mockResolvedValue(null)
  mocks.save.mockResolvedValue(undefined)
  mocks.write.mockResolvedValue(hash)
  mocks.receipt.mockResolvedValue({ status: 'success' })
  mocks.validate.mockResolvedValue(undefined)
  mocks.remoteDisconnect.mockResolvedValue(undefined)
  mocks.remoteConnect.mockResolvedValue({
    request,
    disconnect: mocks.remoteDisconnect,
    on: (name: string, handler: (...args: unknown[]) => void) => listeners.set(name, handler),
    removeListener: (name: string) => listeners.delete(name),
  })
})
afterEach(() => {
  Reflect.deleteProperty(window, 'ethereum')
})

describe('BYOW browser sessions', () => {
  it('connects a remote wallet and authorizes the same scoped browser session', async () => {
    Reflect.deleteProperty(window, 'ethereum')
    const { result } = renderHook(useBrowserWallet, { wrapper })
    expect(result.current.options).toHaveLength(0)
    await act(async () => result.current.connectWalletConnect())
    expect(mocks.remoteConnect).toHaveBeenCalledWith('mainnet')
    expect(result.current.address).toBe(ALICE)
    await act(async () => result.current.authorize(7))
    await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
    await act(async () => result.current.switchNetwork('calibration'))
    expect(result.current.network).toBe('calibration')
    await act(async () => result.current.disconnect())
    expect(mocks.remoteDisconnect).toHaveBeenCalledOnce()
    expect(result.current.address).toBeNull()
    // Disconnect ends the transport session, not the on-chain key authorization.
    expect(mocks.write).toHaveBeenCalledOnce()
  })

  it('connects and authorizes the Calibration session account while a mobile provider cache is empty', async () => {
    request.mockImplementation(async ({ method }) => (method === 'eth_accounts' ? [] : null))
    mocks.remoteConnect.mockResolvedValue({
      request,
      disconnect: mocks.remoteDisconnect,
      session: { namespaces: { eip155: { accounts: [`eip155:314159:${ALICE}`] } } },
    })
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.switchNetwork('calibration'))
    await act(async () => result.current.connectWalletConnect())
    expect(result.current.address).toBe(ALICE)
    expect(result.current.error).toBeNull()
    await act(async () => result.current.authorize(7))
    await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
    expect(mocks.write).toHaveBeenCalledOnce()
    expect(mocks.save.mock.calls[0][0]).toBe(`314159:${ALICE}`)
  })

  it('defers a remote session disconnect while a storage operation is in progress', async () => {
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connectWalletConnect())
    act(() => result.current.setUploading(true))
    act(() => listeners.get('disconnect')?.())
    expect(result.current.address).toBe(ALICE)
    act(() => result.current.setUploading(false))
    await waitFor(() => expect(result.current.address).toBeNull())
  })

  it('reports cancelled remote connections without attaching a wallet', async () => {
    mocks.remoteConnect.mockRejectedValue(new Error('Connection cancelled'))
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connectWalletConnect())
    expect(result.current.address).toBeNull()
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBe('Connection cancelled')
  })

  it('ends an unusable remote session so the next attempt can pair again', async () => {
    request.mockRejectedValueOnce(new Error('Selected network was not approved'))
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connectWalletConnect())
    expect(result.current.address).toBeNull()
    expect(mocks.remoteDisconnect).toHaveBeenCalledOnce()
    expect(result.current.error).toContain('not approved')
    await act(async () => result.current.connectWalletConnect())
    expect(result.current.address).toBe(ALICE)
  })

  it('defaults to mainnet and grants all storage permissions with an explicit expiry', async () => {
    const { result } = renderHook(useBrowserWallet, { wrapper })
    expect(result.current.network).toBe('mainnet')
    await act(async () => result.current.connect())
    await act(async () => result.current.authorize(7))
    await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
    const call = mocks.write.mock.calls[0][0]
    expect(call.functionName).toBe('login')
    expect(call.args[2]).toHaveLength(4)
    expect(Number(call.args[1])).toBeGreaterThan(Date.now() / 1000 + 6 * 86400)
    expect(mocks.save.mock.calls[0][0]).toBe(`314:${ALICE}`)
    expect(result.current.session?.transactionHash).toBe(hash)
    await act(async () => result.current.switchNetwork('calibration'))
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(mocks.load).toHaveBeenLastCalledWith(`314159:${ALICE}`)
  })
  it('defers an extension account switch until the current operation finishes', async () => {
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connect())
    act(() => result.current.setUploading(true))
    act(() => {
      accounts = [BOB]
      listeners.get('accountsChanged')?.(accounts)
    })
    expect(result.current.address).toBe(ALICE)
    expect(result.current.error).toContain('original wallet')
    act(() => result.current.setUploading(false))
    await waitFor(() => expect(result.current.address).toBe(BOB))
    expect(mocks.load).toHaveBeenLastCalledWith(`314:${BOB}`)
  })
  it('does not enable a session when its authorization transaction reverts', async () => {
    mocks.receipt.mockResolvedValue({ status: 'reverted' })
    mocks.validate.mockRejectedValue(new SessionPermissionError())
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connect())
    await act(async () => result.current.authorize(1))
    expect(result.current.sessionStatus).not.toBe('active')
    expect(result.current.error).toContain('reverted')
    expect(mocks.save).toHaveBeenCalledBefore(mocks.write)
  })
  it('checks restored keys against chain permissions rather than trusting the local expiry', async () => {
    mocks.load.mockResolvedValue({ privateKey: `0x${'1'.repeat(64)}`, expiresAt: Math.floor(Date.now() / 1000) + 3600 })
    mocks.validate.mockRejectedValue(new SessionPermissionError())
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connect())
    await waitFor(() => expect(result.current.sessionStatus).toBe('inactive'))
  })

  it('recovers an authorized key after a temporary RPC failure without another owner transaction', async () => {
    vi.useFakeTimers()
    try {
      const session = { privateKey: `0x${'1'.repeat(64)}`, expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400 }
      mocks.load.mockResolvedValue(session)
      mocks.validate.mockRejectedValueOnce(new Error('RPC unavailable')).mockResolvedValue(undefined)
      const { result, unmount } = renderHook(useBrowserWallet, { wrapper })
      await act(async () => result.current.connect())
      expect(result.current.sessionStatus).toBe('checking')
      expect(result.current.error).toContain('Retrying chain reads')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(result.current.sessionStatus).toBe('active')
      expect(result.current.session?.privateKey).toBe(session.privateKey)
      expect(result.current.error).toBeNull()
      expect(mocks.write).not.toHaveBeenCalled()
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for a renewal receipt before validating and persisting chain expirations', async () => {
    mocks.load.mockResolvedValue({
      privateKey: `0x${'1'.repeat(64)}`,
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400,
    })
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connect())
    await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
    mocks.validate.mockClear()
    let confirm!: (receipt: { status: string }) => void
    mocks.receipt.mockImplementation(
      () =>
        new Promise((resolve) => {
          confirm = resolve
        })
    )
    let authorization!: Promise<void>
    act(() => {
      authorization = result.current.authorize(30)
    })
    await waitFor(() => expect(mocks.receipt).toHaveBeenCalled())
    expect(result.current.busy).toBe(true)
    expect(mocks.validate).not.toHaveBeenCalled()
    await act(async () => {
      confirm({ status: 'success' })
      await authorization
    })
    await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
    expect(mocks.validate).toHaveBeenCalled()
  })
})
