import { Download } from 'lucide-react'

type DownloadButtonProps = {
  href: string
  title?: string
}

function DownloadButton({ href, title = 'Download' }: DownloadButtonProps) {
  return (
    <a
      aria-label={title}
      className="text-white inline-flex items-center px-4 py-3 border border-zinc-800 hover:bg-zinc-800 rounded-md"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title={title}
    >
      <Download size={16} />
    </a>
  )
}

export { DownloadButton }
