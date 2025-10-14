import { Copy } from 'lucide-react'
import { TextLink } from './link.tsx'
import { toast } from '@/utils/toast.tsx'

type TextWithCopyToClipboardProps = {
  text: string
  href?: string
}

function TextWithCopyToClipboard({ text, href }: TextWithCopyToClipboardProps) {
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.info('Copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy text:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className="flex items-center gap-2">
      {href ? <TextLink href={href}>{text}</TextLink> : <span className="text-zinc-400">{text}</span>}
      <button
        className="cursor-pointer text-zinc-400 p-2 -m-2 hover:text-white"
        onClick={handleCopyToClipboard}
        title="Copy to clipboard"
        type="button"
      >
        <Copy size={16} />
      </button>
    </div>
  )
}

export { TextWithCopyToClipboard }
