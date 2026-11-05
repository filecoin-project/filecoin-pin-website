import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Landing } from './landing.tsx'

const wallet = vi.hoisted(() => ({ busy: false }))
vi.mock('../../context/browser-wallet-provider.tsx', () => ({ useBrowserWallet: () => wallet }))
vi.mock('./wallet-controls.tsx', () => ({ WalletControls: () => <button type="button">WalletConnect</button> }))

afterEach(() => {
  cleanup()
  wallet.busy = false
})

function launch(source: Window | null) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source, data: 'open-drive' }))
  })
}

describe('landing wallet chooser', () => {
  it('releases its modal while connecting and returns when the connection is cancelled', () => {
    const view = render(<Landing />)
    launch(view.container.querySelector('iframe')?.contentWindow ?? null)
    expect(screen.getByRole('dialog', { name: 'Your wallet. Your drive.' })).toBeTruthy()

    wallet.busy = true
    view.rerender(<Landing />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.pointerEvents).not.toBe('none')

    wallet.busy = false
    view.rerender(<Landing />)
    expect(screen.getByRole('button', { name: 'WalletConnect' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('only accepts launch messages from the landing iframe', () => {
    render(<Landing />)
    launch(window)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
