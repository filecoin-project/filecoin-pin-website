import * as RadixDialog from '@radix-ui/react-dialog'
import { InfoIcon, XIcon } from 'lucide-react'

type DialogProps = {
  content: React.ReactNode
}

function Dialog({ content }: DialogProps) {
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>
        <button
          className="group-focus/button:brand-outline rounded-full bg-zinc-700 p-2 text-zinc-300 group-hover/button:bg-zinc-600 cursor-pointer"
          type="button"
        >
          <InfoIcon size={20} />
        </button>
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/40 animate-in fade-in-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <RadixDialog.Content className="overflow-auto fixed flex flex-col items-end gap-6 top-1/2 bg-(--color-black) border border-zinc-700 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[500px] max-h-[85vh] p-6 pt-16 rounded-lg  shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 focus:outline-none">
          {content}
          <RadixDialog.Close asChild>
            <button
              className="absolute top-4 right-4 focus-visible:brand-outline rounded-full bg-zinc-700 p-2 text-zinc-300 group-hover/button:bg-zinc-600 cursor-pointer"
              type="button"
            >
              <span className="sr-only">Close</span>
              <XIcon size={16} />
            </button>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export { Dialog }
