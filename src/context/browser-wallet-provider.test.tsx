import {
  AddPiecesPermission,
  CreateDataSetPermission,
  SchedulePieceRemovalsPermission,
  TerminateServicePermission,
} from '@filoz/synapse-core/session-key'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  receipt: vi.fn(),
  getReceipt: vi.fn(),
  revoked: vi.fn(),
  validate: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  remoteConnect: vi.fn(),
  remoteRestore: vi.fn(),
  remoteDisconnect: vi.fn(),
}))
vi.mock('../lib/filecoin-pin/browser-wallet.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/filecoin-pin/browser-wallet.ts')>()),
  publicClient: () => ({ waitForTransactionReceipt: mocks.receipt, getTransactionReceipt: mocks.getReceipt }),
  browserSynapse: () => ({
    isRevoked: mocks.revoked,
    validate: mocks.validate,
    expiresAt: () => Math.floor(Date.now() / 1000) + 7 * 86400,
  }),
}))
vi.mock('@filoz/synapse-react', () => ({ getSignerClient: vi.fn(async () => ({})) }))
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  writeContract: (_client: unknown, args: unknown) => mocks.write(args),
}))
vi.mock('../lib/local-storage/session-vault.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/local-storage/session-vault.ts')>()),
  loadBrowserSession: mocks.load,
  saveBrowserSession: mocks.save,
  updateBrowserSession: (scope: string, update: (current: unknown) => unknown) =>
    navigator.locks.request(`test-session-${scope}`, async () => {
      const current = await mocks.load(scope)
      const next = update(current)
      if (next !== current) await mocks.save(scope, next)
      return next
    }),
}))
vi.mock('../lib/filecoin-pin/wallet-connect.ts', () => ({
  walletConnectAvailable: true,
  connectWalletConnect: mocks.remoteConnect,
  restoreWalletConnect: mocks.remoteRestore,
}))

import { SessionPermissionError } from '../lib/filecoin-pin/browser-wallet.ts'
import { saveWalletPreference } from '../lib/local-storage/wallet-connection.ts'
import { BrowserWalletProvider, useBrowserWallet } from './browser-wallet-provider.tsx'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const hash = `0x${'a'.repeat(64)}`
let chainId: string
let announce: () => void
let accounts: string[]
let listeners: Map<string, (...args: unknown[]) => void>
let request: ReturnType<typeof vi.fn>
const wrapper = ({ children }: { children: ReactNode }) => <BrowserWalletProvider>{children}</BrowserWalletProvider>
beforeEach(() => {
  vi.clearAllMocks()
  chainId = '0x13a'
  accounts = [ALICE]
  listeners = new Map()
  request = vi.fn(async ({ method, params }) => {
    if (method === 'eth_chainId') return chainId
    if (method === 'wallet_switchEthereumChain') {
      chainId = params[0].chainId
      listeners.get('chainChanged')?.(chainId)
      return null
    }
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
  announce = () => {
    const injected = Reflect.get(window, 'ethereum')
    if (injected)
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: {
              uuid: '350670db-19fa-4704-a166-e52e178b59d9',
              name: 'Test wallet',
              rdns: 'test.wallet',
              icon: 'data:image/png;base64,a',
            },
            provider: injected,
          },
        })
      )
  }
  window.addEventListener('eip6963:requestProvider', announce)
  const vault = new Map()
  mocks.load.mockImplementation(async (scope) => vault.get(scope) ?? null)
  mocks.save.mockImplementation(async (scope, session) => {
    if (session) vault.set(scope, session)
    else vault.delete(scope)
    window.dispatchEvent(new CustomEvent('filecoin-drive-session-change', { detail: scope }))
  })
  mocks.write.mockResolvedValue(hash)
  mocks.receipt.mockResolvedValue({ status: 'success' })
  mocks.getReceipt.mockRejectedValue(new Error('Receipt not found'))
  mocks.revoked.mockResolvedValue(false)
  mocks.validate.mockResolvedValue(undefined)
  mocks.remoteRestore.mockResolvedValue(null)
  mocks.remoteDisconnect.mockResolvedValue(undefined)
  mocks.remoteConnect.mockResolvedValue({
    request,
    disconnect: mocks.remoteDisconnect,
    on: (name: string, handler: (...args: unknown[]) => void) => listeners.set(name, handler),
    removeListener: (name: string) => listeners.delete(name),
  })
})
afterEach(() => {
  window.removeEventListener('eip6963:requestProvider', announce)
  Reflect.deleteProperty(window, 'ethereum')
})

describe('BYOW browser sessions', () => {
  it('reuses and synchronizes the latest key across two already-open wallet views', async () => {
    const first = renderHook(useBrowserWallet, { wrapper })
    const second = renderHook(useBrowserWallet, { wrapper })
    await act(async () => first.result.current.connect())
    await act(async () => second.result.current.connect())
    await act(async () => first.result.current.authorize(7))
    const key = first.result.current.session?.privateKey
    await waitFor(() => expect(second.result.current.session?.privateKey).toBe(key))
    await act(async () => second.result.current.authorize(7))
    expect(second.result.current.session?.privateKey).toBe(key)
    expect(mocks.write.mock.calls[0][0].args[0]).toBe(mocks.write.mock.calls[1][0].args[0])
    await waitFor(() => expect(first.result.current.session).toEqual(second.result.current.session))
  })

  it.each([false, true])(
    'does not erase a newer session when an older revocation confirms (same key: %s)',
    async (sameKey) => {
      const { result } = renderHook(useBrowserWallet, { wrapper })
      await act(async () => result.current.connect())
      await act(async () => result.current.authorize(7))
      const original = result.current.session
      expect(original).not.toBeNull()
      mocks.receipt.mockClear()
      let settle!: (receipt: { status: string }) => void
      mocks.receipt.mockImplementation(
        () =>
          new Promise((resolve) => {
            settle = resolve
          })
      )
      let revocation!: Promise<void>
      act(() => {
        revocation = result.current.revoke()
      })
      await waitFor(() => expect(mocks.receipt).toHaveBeenCalledOnce())
      const updated = {
        ...original,
        privateKey: sameKey ? original?.privateKey : `0x${'2'.repeat(64)}`,
        revision: 'another-tab-authorization',
      }
      await act(async () => mocks.save(`314:${ALICE}`, updated))
      await act(async () => {
        settle({ status: 'success' })
        await revocation
      })
      expect(await mocks.load(`314:${ALICE}`)).toEqual(updated)
      expect(result.current.session?.revision).toBe(updated.revision)
      expect(mocks.save.mock.calls.some(([, value]) => value === null)).toBe(false)
    }
  )

  it('rereads a missed session change when the page returns to the foreground', async () => {
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => result.current.connect())
    await act(async () => result.current.authorize(7))
    // No notification, as can happen while a page is frozen.
    mocks.load.mockResolvedValue(null)
    await act(async () => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(result.current.sessionStatus).toBe('none')
  })

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
    request.mockImplementation(async ({ method }) =>
      method === 'eth_accounts' ? [] : method === 'eth_chainId' ? '0x4cb2f' : null
    )
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
    await act(async () => {
      await listeners.get('disconnect')?.()
    })
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

  it('defaults to mainnet and grants only upload and piece-removal permissions with an explicit expiry', async () => {
    const { result } = renderHook(useBrowserWallet, { wrapper })
    expect(result.current.network).toBe('mainnet')
    await act(async () => result.current.connect())
    await act(async () => result.current.authorize(7))
    await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
    const call = mocks.write.mock.calls[0][0]
    expect(call.functionName).toBe('login')
    expect(call.args[2]).toEqual([CreateDataSetPermission, AddPiecesPermission, SchedulePieceRemovalsPermission])
    expect(call.args[2]).not.toContain(TerminateServicePermission)
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

it('remembers a manually selected network after remount and uses it when connecting', async () => {
  const first = renderHook(useBrowserWallet, { wrapper })
  expect(first.result.current.network).toBe('mainnet')
  await act(async () => first.result.current.switchNetwork('calibration'))
  first.unmount()
  const second = renderHook(useBrowserWallet, { wrapper })
  expect(second.result.current.network).toBe('calibration')
  await act(async () => second.result.current.connect())
  expect(request).toHaveBeenCalledWith({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x4cb2f' }] })
  await act(async () => second.result.current.disconnect())
  second.unmount()
  const third = renderHook(useBrowserWallet, { wrapper })
  expect(third.result.current.network).toBe('calibration')
  await act(async () => third.result.current.switchNetwork('mainnet'))
  third.unmount()
  expect(renderHook(useBrowserWallet, { wrapper }).result.current.network).toBe('mainnet')
})

it('keeps the last successful network choice when the wallet rejects a switch', async () => {
  const first = renderHook(useBrowserWallet, { wrapper })
  await act(async () => first.result.current.switchNetwork('calibration'))
  await act(async () => first.result.current.connect())
  request.mockRejectedValueOnce(new Error('User rejected network switch'))
  await act(async () => first.result.current.switchNetwork('mainnet'))
  expect(first.result.current.network).toBe('calibration')
  expect(first.result.current.error).toContain('User rejected')
  first.unmount()
  expect(renderHook(useBrowserWallet, { wrapper }).result.current.network).toBe('calibration')
})

it('defaults to Mainnet when the saved network is invalid or browser storage is blocked', () => {
  localStorage.setItem('filecoin-drive-network', 'ethereum')
  const first = renderHook(useBrowserWallet, { wrapper })
  expect(first.result.current.network).toBe('mainnet')
  first.unmount()
  const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('Storage blocked')
  })
  const second = renderHook(useBrowserWallet, { wrapper })
  expect(second.result.current.network).toBe('mainnet')
  second.unmount()
  read.mockRestore()
})

it('silently restores an injected wallet and saved key after reload, and respects Disconnect', async () => {
  mocks.load.mockResolvedValue({ privateKey: `0x${'1'.repeat(64)}`, expiresAt: Math.floor(Date.now() / 1000) + 86400 })
  const first = renderHook(useBrowserWallet, { wrapper })
  await act(async () => first.result.current.connect())
  first.unmount()
  request.mockClear()
  const second = renderHook(useBrowserWallet, { wrapper })
  await waitFor(() => expect(second.result.current.sessionStatus).toBe('active'))
  expect(second.result.current.address).toBe(ALICE)
  expect(request.mock.calls.map(([call]) => call.method)).toEqual(expect.arrayContaining(['eth_accounts']))
  expect(request.mock.calls.every(([call]) => ['eth_accounts', 'eth_chainId'].includes(call.method))).toBe(true)
  expect(mocks.write).not.toHaveBeenCalled()
  await act(async () => second.result.current.disconnect())
  second.unmount()
  request.mockClear()
  const third = renderHook(useBrowserWallet, { wrapper })
  expect(third.result.current.restoring).toBe(false)
  expect(third.result.current.address).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

it('returns to explicit Connect for a locked wallet without requesting accounts or switching chains', async () => {
  saveWalletPreference({ type: 'injected' })
  accounts = []
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await waitFor(() => expect(result.current.restoring).toBe(false))
  expect(result.current.address).toBeNull()
  expect(result.current.error).toBeNull()
  expect(request.mock.calls.map(([call]) => call.method)).toEqual(expect.arrayContaining(['eth_accounts']))
  expect(request.mock.calls.every(([call]) => ['eth_accounts', 'eth_chainId'].includes(call.method))).toBe(true)
})

it('restores the selected EIP-6963 wallet by rdns even when its per-page UUID changes', async () => {
  saveWalletPreference({ type: 'injected', rdns: 'io.selected.wallet' })
  const selectedRequest = vi.fn(async ({ method }) => (method === 'eth_chainId' ? '0x13a' : [BOB]))
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await act(async () => {
    await Promise.resolve()
  })
  act(() =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: {
            uuid: '350670db-19fa-4704-a166-e52e178b59d2',
            name: 'Selected wallet',
            rdns: 'io.selected.wallet',
            icon: 'data:image/svg+xml,<svg></svg>',
          },
          provider: { request: selectedRequest, on: () => undefined, removeListener: () => undefined },
        },
      })
    )
  )
  await waitFor(() => expect(result.current.address).toBe(BOB))
  expect(selectedRequest).toHaveBeenCalledWith({ method: 'eth_accounts' })
  expect(request).not.toHaveBeenCalled()
})

it('does not fall back to a different installed wallet when the remembered wallet is unavailable', async () => {
  vi.useFakeTimers()
  try {
    saveWalletPreference({ type: 'injected', rdns: 'io.uninstalled.wallet' })
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.restoring).toBe(false)
    expect(result.current.address).toBeNull()
    expect(request).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

it('ignores a late silent connection after the user disconnects', async () => {
  saveWalletPreference({ type: 'injected' })
  let finish!: (accounts: string[]) => void
  request.mockImplementation(
    () =>
      new Promise<string[]>((resolve) => {
        finish = resolve
      })
  )
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await waitFor(() => expect(request).toHaveBeenCalledWith({ method: 'eth_accounts' }))
  await act(async () => result.current.disconnect())
  await act(async () => {
    finish([ALICE])
  })
  expect(result.current.address).toBeNull()
  expect(result.current.restoring).toBe(false)
})

it.each([true, false])('restores a WalletConnect connection only when its session is reusable (%s)', async (valid) => {
  saveWalletPreference({ type: 'walletconnect' })
  mocks.remoteRestore.mockResolvedValue(valid ? { provider: { request }, address: ALICE } : null)
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await waitFor(() => expect(result.current.restoring).toBe(false))
  expect(result.current.address).toBe(valid ? ALICE : null)
  expect(mocks.remoteRestore).toHaveBeenCalledWith('mainnet')
  expect(mocks.remoteConnect).not.toHaveBeenCalled()
  expect(request.mock.calls.every(([call]) => ['eth_accounts', 'eth_chainId'].includes(call.method))).toBe(true)
})

it('stops waiting for an unresponsive wallet and ignores accounts that arrive after the timeout', async () => {
  vi.useFakeTimers()
  try {
    saveWalletPreference({ type: 'injected' })
    let finish!: (accounts: string[]) => void
    request.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          finish = resolve
        })
    )
    const { result } = renderHook(useBrowserWallet, { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })
    expect(result.current.restoring).toBe(false)
    expect(result.current.address).toBeNull()
    await act(async () => {
      finish([ALICE])
    })
    expect(result.current.address).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('keeps timed-out authorization pending, blocks resubmission and recovers its permissions', async () => {
  mocks.receipt.mockRejectedValue(new Error('Timed out waiting for receipt'))
  mocks.validate.mockRejectedValue(new SessionPermissionError())
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await act(async () => result.current.connect())
  await act(async () => result.current.authorize(7))
  expect(result.current.pendingTransaction?.hash).toBe(hash)
  expect(result.current.error).toBeNull()
  expect(result.current.busy).toBe(false)
  await act(async () => result.current.authorize(7))
  expect(mocks.write).toHaveBeenCalledOnce()
  mocks.validate.mockResolvedValue(undefined)
  await act(async () => result.current.refreshTransaction())
  await waitFor(() => expect(result.current.pendingTransaction).toBeNull())
  await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
  expect(mocks.write).toHaveBeenCalledOnce()
})

it('does not mistake an existing seven-day grant for a successful thirty-day renewal', async () => {
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await act(async () => result.current.connect())
  await act(async () => result.current.authorize(7))
  await waitFor(() => expect(result.current.sessionStatus).toBe('active'))
  mocks.receipt.mockRejectedValue(new Error('Timeout'))
  await act(async () => result.current.authorize(30))
  await act(async () => result.current.refreshTransaction())
  expect(result.current.pendingTransaction?.kind).toBe('authorize')
  expect(result.current.sessionStatus).toBe('checking')
  mocks.getReceipt.mockResolvedValue({ status: 'success' })
  await act(async () => result.current.refreshTransaction())
  await waitFor(() => expect(result.current.pendingTransaction).toBeNull())
})

it('recovers a timed-out revocation only when all session permissions are revoked', async () => {
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await act(async () => result.current.connect())
  await act(async () => result.current.authorize(7))
  mocks.receipt.mockRejectedValue(new Error('Timeout'))
  await act(async () => result.current.revoke())
  expect(result.current.pendingTransaction?.kind).toBe('revoke')
  const revoke = mocks.write.mock.calls.at(-1)?.[0]
  expect(revoke.functionName).toBe('revoke')
  expect(revoke.args[1]).toEqual([
    CreateDataSetPermission,
    AddPiecesPermission,
    SchedulePieceRemovalsPermission,
    TerminateServicePermission,
  ])
  expect(result.current.session).not.toBeNull()
  mocks.revoked.mockResolvedValue(true)
  await act(async () => result.current.refreshTransaction())
  await waitFor(() => expect(result.current.pendingTransaction).toBeNull())
  expect(result.current.session).toBeNull()
  expect(mocks.save).toHaveBeenLastCalledWith(`314:${ALICE}`, null)
})

it('tracks the submitted authorization immediately without another vault write before confirmation', async () => {
  mocks.save.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('Vault unavailable after signing'))
  mocks.receipt.mockRejectedValue(new Error('Timeout'))
  mocks.validate.mockRejectedValue(new SessionPermissionError())
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await act(async () => result.current.connect())
  await act(async () => result.current.authorize(7))
  expect(mocks.save).toHaveBeenCalledOnce()
  expect(result.current.pendingTransaction?.hash).toBe(hash)
  expect(result.current.error).toBeNull()
})

it('reports network-switch failures separately from wallet connection failures', async () => {
  chainId = '0x1'
  request.mockImplementation(async (args) => {
    if (args.method === 'wallet_switchEthereumChain') throw { code: 4200, message: 'Unsupported method' }
    if (args.method === 'eth_chainId') return chainId
    if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') return accounts
    return null
  })
  const { result } = renderHook(useBrowserWallet, { wrapper })
  await act(async () => result.current.connect())
  expect(result.current.address).toBeNull()
  expect(result.current.busy).toBe(false)
  expect(result.current.error).toContain('unable to switch the wallet')
  expect(result.current.error).toContain('Unsupported method')
  expect(result.current.error).toContain('4200')
})

it('releases the page after a stuck connection and ignores a late account response', async () => {
  vi.useFakeTimers()
  try {
    let finish!: (value: string[]) => void
    request.mockImplementation(async ({ method }) => {
      if (method === 'eth_requestAccounts')
        return new Promise<string[]>((resolve) => {
          finish = resolve
        })
      if (method === 'eth_accounts') return accounts
      if (method === 'eth_chainId') return chainId
      return null
    })
    const { result } = renderHook(useBrowserWallet, { wrapper })
    let connecting!: Promise<void>
    await act(async () => {
      connecting = result.current.connect()
      await Promise.resolve()
    })
    expect(result.current.busy).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000)
      await connecting
    })
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toContain('45 seconds')
    const count = request.mock.calls.length
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.error).toContain('still pending')
    expect(request.mock.calls).toHaveLength(count)
    await act(async () => {
      finish([ALICE])
      await Promise.resolve()
    })
    expect(result.current.address).toBeNull()
    expect(localStorage.getItem('filecoin-drive-wallet')).toBeNull()
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.address).toBe(ALICE)
  } finally {
    vi.useRealTimers()
  }
})

it('allows another wallet after timeout and keeps it selected when the old wallet responds', async () => {
  vi.useFakeTimers()
  try {
    let finish!: (value: string[]) => void
    request.mockImplementation(async ({ method }) => {
      if (method === 'eth_requestAccounts')
        return new Promise<string[]>((resolve) => {
          finish = resolve
        })
      if (method === 'eth_accounts') return [ALICE]
      if (method === 'eth_chainId') return '0x13a'
      return null
    })
    const otherRequest = vi.fn(async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [BOB]
      if (method === 'eth_chainId') return '0x13a'
      return null
    })
    const { result } = renderHook(useBrowserWallet, { wrapper })
    let connecting!: Promise<void>
    await act(async () => {
      connecting = result.current.connect()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000)
      await connecting
    })
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: {
              uuid: '350670db-19fa-4704-a166-e52e178b59d8',
              name: 'Other wallet',
              rdns: 'test.other.wallet',
              icon: 'data:image/png;base64,a',
            },
            provider: { request: otherRequest, on: () => undefined, removeListener: () => undefined },
          },
        })
      )
    })
    const other = result.current.options.find((option) => option.name === 'Other wallet')
    expect(other).toBeDefined()
    await act(async () => {
      await result.current.connect(other?.id)
    })
    expect(result.current.address).toBe(BOB)
    await act(async () => {
      finish([ALICE])
      await Promise.resolve()
    })
    expect(result.current.address).toBe(BOB)
    expect(result.current.busy).toBe(false)
    await act(async () => {
      await result.current.authorize(7)
    })
    expect(result.current.error).toBeNull()
    expect(otherRequest.mock.calls.some(([args]) => args.method === 'wallet_switchEthereumChain')).toBe(true)
    expect(request.mock.calls.some(([args]) => args.method === 'wallet_switchEthereumChain')).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})
