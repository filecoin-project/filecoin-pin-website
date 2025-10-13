import { Copy } from 'lucide-react'

type TextWithCopyToClipboardProps = {
  text: string
  href?: string
  hideCopyToClipboard?: boolean
}

function TextWithCopyToClipboard({ text, href, hideCopyToClipboard = false }: TextWithCopyToClipboardProps) {
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {href ? (
        <a className="text-brand-500" href={href} rel="noopener noreferrer" target="_blank">
          {text}
        </a>
      ) : (
        <span className="text-zinc-400 break-all">{text}</span>
      )}

      {!hideCopyToClipboard && (
        <button
          className="cursor-pointer text-zinc-400 p-2 -m-2 hover:text-white"
          onClick={handleCopyToClipboard}
          title="Copy to clipboard"
          type="button"
        >
          <Copy size={16} />
        </button>
      )}
    </div>
  )
}

export { TextWithCopyToClipboard }
