import { ArrowUpRight } from 'lucide-react'

const linkClass = 'text-foreground underline decoration-border underline-offset-4 hover:text-accent'

const feedbackUrl = `https://github.com/filecoin-project/filecoin-pin-website/issues/new?${new URLSearchParams({
  title: '[Drive feedback] ',
  body: '### What happened?\n\n\n### What did you expect?\n\n\n### Screenshot (optional)\n\n',
})}`

export function DeveloperFooter() {
  return (
    <footer className="flex flex-col gap-3 border-t border-border py-6 text-xs leading-6 text-muted sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="space-y-2">
        <p>
          Drive’s uploads, session keys and payments are powered by{' '}
          <a
            className={linkClass}
            href="https://docs.filecoin.cloud/developer-guides/synapse/"
            rel="noopener noreferrer"
            target="_blank"
          >
            Synapse SDK
          </a>{' '}
          and{' '}
          <a
            className={linkClass}
            href="https://github.com/filecoin-project/filecoin-pin"
            rel="noopener noreferrer"
            target="_blank"
          >
            Filecoin Pin
          </a>
          .
        </p>
        <p>
          <a
            className={linkClass}
            href="https://github.com/filecoin-project/filecoin-pin-website"
            rel="noopener noreferrer"
            target="_blank"
          >
            Fork the repo
          </a>
          , or{' '}
          <a
            className={linkClass}
            href="https://docs.filecoin.cloud/developer-guides/synapse/"
            rel="noopener noreferrer"
            target="_blank"
          >
            start with the SDK
          </a>{' '}
          and build something better.
        </p>
      </div>
      <a
        className={`${linkClass} inline-flex shrink-0 items-center gap-1 self-start`}
        href={feedbackUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        Send feedback <ArrowUpRight aria-hidden="true" size={13} />
      </a>
    </footer>
  )
}
