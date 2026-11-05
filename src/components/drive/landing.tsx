import { useEffect, useRef, useState } from 'react'
import { ButtonBase } from '../ui/button/button-base.tsx'
import { WalletControls } from './wallet-controls.tsx'

export function Landing() {
  const frame = useRef<HTMLIFrameElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
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
  useEffect(() => {
    if (open) dialog.current?.showModal()
  }, [open])
  return (
    <main>
      <iframe
        className="block h-dvh w-full border-0"
        ref={frame}
        src="/drive-field.html"
        title="Filecoin Drive — interactive storage explorer"
      />
      <dialog
        aria-labelledby="landing-wallet-title"
        className="m-auto w-[min(94vw,850px)] rounded-xl border border-border bg-canvas p-6 text-foreground backdrop:bg-black/40"
        onClose={() => setOpen(false)}
        ref={dialog}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold" id="landing-wallet-title">
            Your wallet. Your drive.
          </h2>
          <ButtonBase
            className="min-h-0 w-auto rounded border border-border px-3 py-2 text-base font-normal"
            onClick={() => dialog.current?.close()}
            type="button"
            variant="unstyled"
          >
            Close
          </ButtonBase>
        </div>
        <p className="mb-5 text-sm text-muted">
          Connect a wallet to open your workspace. Storage payments and browser authorization are set up inside Drive.
        </p>
        <WalletControls />
      </dialog>
    </main>
  )
}
