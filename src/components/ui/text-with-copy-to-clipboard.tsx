import { CopyButton } from './copy-button.tsx'
import { TextLink } from './link.tsx'

type TextWithCopyToClipboardProps = {
  text: string
  prefix?: string
  href?: string
}

function TextWithCopyToClipboard({ text, prefix, href }: TextWithCopyToClipboardProps) {
  return (
    <span className="flex items-center gap-2 min-w-0 w-full">
      {prefix && <span className="text-muted">{prefix}</span>}
      {href ? (
        <TextLink href={href} isTruncated>
          {text}
        </TextLink>
      ) : (
        <span className="text-muted">{text}</span>
      )}
      <CopyButton className="flex-shrink-0" iconOnly value={text} />
    </span>
  )
}

export { TextWithCopyToClipboard }
