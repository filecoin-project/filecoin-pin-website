const linkClass = 'text-foreground underline decoration-border underline-offset-4 hover:text-accent'

export function DeveloperFooter() {
  return (
    <footer className="space-y-2 border-t border-border py-6 text-xs leading-6 text-muted">
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
    </footer>
  )
}
