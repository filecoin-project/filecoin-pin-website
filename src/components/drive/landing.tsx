import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { ButtonBase } from '../ui/button/button-base.tsx'
import { WalletControls } from './wallet-controls.tsx'

export function Landing() {
  const frame = useRef<HTMLIFrameElement>(null)
  const wallet = useBrowserWallet()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data === 'open-drive'
      ) {
        setOpen(true)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])
  return (
    <main>
      <iframe
        className="block h-dvh w-full border-0"
        ref={frame}
        src="/drive-field.html"
        title="Filecoin Drive — interactive storage explorer"
      />
      <Dialog.Root onOpenChange={setOpen} open={open && !wallet.busy}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(94vw,850px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-canvas p-6 text-foreground">
            <div className="mb-5 flex items-center justify-between">
              <Dialog.Title className="text-xl font-semibold">Your wallet. Your drive.</Dialog.Title>
              <ButtonBase
                className="min-h-0 w-auto rounded border border-border px-3 py-2 text-base font-normal"
                onClick={() => setOpen(false)}
                type="button"
                variant="unstyled"
              >
                Close
              </ButtonBase>
            </div>
            <Dialog.Description className="mb-5 text-sm text-muted">
              Connect a wallet to open your workspace. Storage payments and browser authorization are set up inside
              Drive.
            </Dialog.Description>
            <WalletControls />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
