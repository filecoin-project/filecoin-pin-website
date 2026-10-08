import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { AlertTriangle, CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react'
import { ButtonBase } from '@/components/ui/button/button-base.tsx'

const alertVariants = cva('flex items-center gap-3 p-4 rounded-xl border flex-wrap', {
  variants: {
    variant: {
      success: 'bg-emerald-500/10 border-emerald-500/25 text-success',
      error: 'bg-red-500/10 border-red-500/25 text-danger',
      info: 'bg-brand-800/10 border-brand-700/25 text-accent',
      warning: 'bg-amber-500/10 border-amber-500/25 text-warning',
      neutral: 'bg-surface border-border/40 text-foreground',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
})

const messageVariants = cva('text-base', {
  variants: {
    variant: {
      success: 'text-success',
      error: 'text-danger',
      info: 'text-accent',
      warning: 'text-warning',
      neutral: 'text-foreground',
    },
  },
})

const descriptionVariants = cva('', {
  variants: {
    variant: {
      success: 'text-success',
      error: 'text-danger',
      info: 'text-accent',
      warning: 'text-warning',
      neutral: 'text-foreground',
    },
  },
})

const iconVariants = cva('', {
  variants: {
    variant: {
      success: 'text-success',
      error: 'text-danger',
      info: 'text-accent',
      warning: 'text-warning',
      neutral: 'text-muted',
    },
  },
})

const sharedButtonStyle = 'w-fit flex-shrink-0'

const primaryButtonVariants = cva(sharedButtonStyle, {
  variants: {
    variant: {
      success: 'bg-green-700 hover:bg-green-800 text-green-50',
      error: 'bg-red-700 hover:bg-red-800 text-red-50',
      info: 'bg-button-brand hover:bg-button-brand-hover text-white',
      warning: 'bg-yellow-700 hover:bg-yellow-800 text-white',
      neutral: 'bg-surface-raised hover:bg-surface text-foreground',
    },
  },
})

const secondaryButtonVariants = cva(sharedButtonStyle, {
  variants: {
    variant: {
      success: 'hover:bg-emerald-500/15 border border-emerald-500/30 text-success',
      error: 'hover:bg-red-500/15 border border-red-500/30 text-danger',
      info: 'hover:bg-brand-800/15 border border-brand-700/30 text-accent',
      warning: 'hover:bg-amber-500/15 border border-amber-500/30 text-warning',
      neutral: 'hover:bg-surface-raised border border-border text-muted',
    },
  },
})

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>

type ButtonType = {
  children: React.ReactNode
  onClick?: React.ComponentProps<'button'>['onClick']
}

type AlertProps = {
  variant?: AlertVariant
  message: string
  description?: string
  button?: ButtonType
  cancelButton?: ButtonType
}

const ICONS: Record<AlertVariant, LucideIcon> = {
  success: CircleCheck,
  error: AlertTriangle,
  info: Info,
  warning: CircleAlert,
  neutral: CircleAlert,
}

export function Alert({ variant = 'neutral', message, description, button, cancelButton }: AlertProps) {
  const Icon = ICONS[variant]

  return (
    <div className={alertVariants({ variant })} role="alert">
      <span aria-hidden="true" className={iconVariants({ variant })}>
        <Icon size={22} />
      </span>

      <div className="flex-1 flex flex-col gap-0.5 min-w-0 break-words md:min-w-[200px]">
        <span className={clsx(messageVariants({ variant }), description && 'font-semibold')}>{message}</span>
        {description && <span className={descriptionVariants({ variant })}>{description}</span>}
      </div>

      {(button || cancelButton) && (
        <div className="flex gap-3 basis-full md:basis-auto flex-shrink-0">
          {cancelButton && (
            <ButtonBase
              {...cancelButton}
              className={secondaryButtonVariants({ variant })}
              size="sm"
              variant="unstyled"
            />
          )}
          {button && (
            <ButtonBase {...button} className={primaryButtonVariants({ variant })} size="sm" variant="unstyled" />
          )}
        </div>
      )}
    </div>
  )
}
