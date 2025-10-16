import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { AlertTriangle, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { ButtonBase } from '@/components/ui/button/button-base.tsx'

const alertVariants = cva('flex items-center gap-3 p-4 rounded-xl border', {
  variants: {
    variant: {
      success: 'bg-green-950/60 border-green-900/40 text-green-200',
      error: 'bg-red-950/60 border-red-900/40 text-red-300',
      info: 'bg-brand-950/60 border-brand-900/40 text-brand-400',
      warning: 'bg-yellow-600/30 border-yellow-400/20 text-yellow-100',
      neutral: 'bg-zinc-900 border-zinc-700/40 text-zinc-100',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
})

const messageVariants = cva('text-base', {
  variants: {
    variant: {
      success: 'text-green-300',
      error: 'text-red-400',
      info: 'text-brand-500',
      warning: 'text-yellow-200',
      neutral: 'text-zinc-100',
    },
  },
})

const descriptionVariants = cva('', {
  variants: {
    variant: {
      success: 'text-green-200',
      error: 'text-red-300',
      info: 'text-brand-400',
      warning: 'text-yellow-100',
      neutral: 'text-zinc-200',
    },
  },
})

const iconVariants = cva('', {
  variants: {
    variant: {
      success: 'text-green-300',
      error: 'text-red-400',
      info: 'text-brand-500',
      warning: 'text-yellow-200',
      neutral: 'text-zinc-400',
    },
  },
})

const buttonVariants = cva('px-4 py-2 rounded-lg w-fit flex-shrink-0', {
  variants: {
    variant: {
      success: 'bg-green-700 hover:bg-green-600 text-green-50',
      error: 'bg-red-700 hover:bg-red-600 text-red-50',
      info: 'bg-brand-700 hover:bg-brand-600 text-brand-50',
      warning: 'bg-yellow-700 hover:bg-yellow-600 text-white',
      neutral: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100',
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

const ICONS: Record<AlertVariant, React.ElementType> = {
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

      <div className="flex-1 flex flex-col gap-0.5">
        <span className={clsx(messageVariants({ variant }), description && 'font-semibold')}>{message}</span>
        {description && <span className={descriptionVariants({ variant })}>{description}</span>}
      </div>

      {(button || cancelButton) && (
        <div className="flex gap-3 flex-shrink-0">
          {cancelButton && (
            <ButtonBase className={buttonVariants()} onClick={cancelButton.onClick} variant="secondary">
              {cancelButton.children}
            </ButtonBase>
          )}
          {button && (
            <ButtonBase className={buttonVariants({ variant })} onClick={button.onClick} type="button">
              {button.children}
            </ButtonBase>
          )}
        </div>
      )}
    </div>
  )
}
