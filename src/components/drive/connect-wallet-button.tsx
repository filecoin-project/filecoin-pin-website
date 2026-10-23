import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { useBrowserWallet } from '../../context/browser-wallet-provider.tsx'
import { ButtonBase } from '../ui/button/button-base.tsx'

function WalletIcon({ icon }: { icon?: string }) {
  const [failedIcon, setFailedIcon] = useState<string>()
  // EIP-6963 icons are data URIs; rendering in an img keeps SVG scripts inert.
  return icon?.startsWith('data:image/') && failedIcon !== icon ? (
    <img alt="" className="h-7 w-7 shrink-0 object-contain" onError={() => setFailedIcon(icon)} src={icon} />
  ) : (
    <Wallet aria-hidden="true" className="h-7 w-7 shrink-0 text-muted" />
  )
}

export function ConnectWalletButton({ label = 'Connect wallet', size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  const wallet = useBrowserWallet()
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <ButtonBase
          className="w-auto"
          loading={wallet.busy || wallet.restoring}
          onClick={(event) => {
            if (wallet.options.length <= 1) {
              event.preventDefault()
              void wallet.connect()
            }
          }}
          size={size}
        >
          {size === 'sm' && <Wallet aria-hidden="true" size={15} />}
          {wallet.restoring ? 'Reconnecting…' : label}
          {size !== 'sm' && <ArrowRight aria-hidden="true" size={16} />}
        </ButtonBase>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface p-6 text-foreground shadow-xl focus:outline-none">
          <Dialog.Title className="pr-8 text-lg font-semibold">Connect a wallet</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Select a browser wallet to continue.
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close wallet selection"
            className="absolute right-4 top-4 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground focus:brand-outline"
          >
            <X aria-hidden="true" size={18} />
          </Dialog.Close>
          <div className="mt-5 flex min-h-0 flex-col gap-2 overflow-y-auto">
            {wallet.options.map((option) => (
              <Dialog.Close asChild key={option.id}>
                <ButtonBase
                  className="justify-start gap-3 text-left"
                  disabled={wallet.busy || wallet.restoring}
                  onClick={() => void wallet.connect(option.id)}
                  variant="secondary"
                >
                  <WalletIcon icon={option.icon} />
                  <span className="min-w-0 break-words whitespace-normal">{option.name}</span>
                </ButtonBase>
              </Dialog.Close>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
