import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn.ts'
import { toast } from '../../utils/toast.tsx'

type CopyButtonProps = {
  value: string
  label?: string
  iconOnly?: boolean
  className?: string
}

export function CopyButton({ value, label = 'Copy to clipboard', iconOnly = false, className }: CopyButtonProps) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const copied = copiedValue === value
  const [copying, setCopying] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
    }
  }, [])

  async function copy() {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(value)
      if (!mounted.current) return
      clearTimeout(timer.current)
      setCopiedValue(value)
      timer.current = setTimeout(() => setCopiedValue(null), 2000)
    } catch {
      if (mounted.current) toast.error('Failed to copy to clipboard')
    } finally {
      if (mounted.current) setCopying(false)
    }
  }

  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md p-1.5 text-xs cursor-pointer transition-colors focus:brand-outline',
        copied ? 'text-success bg-success-surface' : 'text-muted hover:text-foreground hover:bg-surface-hover',
        className
      )}
      disabled={copying}
      onClick={() => void copy()}
      title={copied ? 'Copied!' : label}
      type="button"
    >
      <span className={copied ? 'copy-feedback' : ''} key={copied ? 'copied' : 'copy'}>
        {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
      </span>
      {!iconOnly && <span>{copied ? 'Copied!' : label}</span>}
      <span aria-live="polite" className="sr-only" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  )
}
