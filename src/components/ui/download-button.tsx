import { Download } from 'lucide-react'
import { ExternalLink } from './link.tsx'

type DownloadButtonProps = {
  href: string
  title?: string
}

function DownloadButton({ href, title = 'Download' }: DownloadButtonProps) {
  return (
    <ExternalLink
      aria-label={title}
      className="text-white inline-flex items-center px-4 py-3 border border-zinc-800 hover:bg-zinc-800 rounded-md focus:brand-outline"
      href={href}
      title={title}
    >
      <Download size={16} />
    </ExternalLink>
  )
}

export { DownloadButton }
