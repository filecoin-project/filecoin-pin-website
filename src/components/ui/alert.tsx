import { clsx } from 'clsx'
import { AlertTriangle, CircleAlert, CircleCheck } from 'lucide-react'

const variantConfig = {
  success: {
    containerClass: 'bg-green-950/60 border border-green-900/40',
    textClass: 'text-green-300',
    iconClass: 'text-green-300',
    Icon: CircleCheck,
    buttonClass: 'bg-green-700 hover:bg-green-600 text-green-50',
  },
  error: {
    containerClass: 'bg-red-950/60 border border-red-900/40',
    textClass: 'text-red-300',
    iconClass: 'text-red-300',
    Icon: AlertTriangle,
    buttonClass: 'bg-red-700 hover:bg-red-600 text-red-50',
  },
  info: {
    containerClass: 'bg-brand-950/60 border border-brand-900/40',
    textClass: 'text-brand-500',
    iconClass: 'text-brand-500',
    Icon: CircleCheck,
    buttonClass: 'bg-brand-700 hover:bg-brand-600 text-brand-50',
  },
  warning: {
    containerClass: 'bg-yellow-600/30 border border-yellow-400/20',
    textClass: 'text-yellow-200',
    iconClass: 'text-yellow-200',
    Icon: CircleAlert,
    buttonClass: 'bg-yellow-700 hover:bg-yellow-600 text-white',
  },
  neutral: {
    containerClass: 'bg-zinc-900 border border-zinc-700/40',
    textClass: 'text-zinc-100',
    iconClass: 'text-zinc-400',
    Icon: CircleAlert,
    buttonClass: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100',
  },
}

export type AlertVariant = keyof typeof variantConfig

type AlertProps = {
  variant: AlertVariant
  message: string
  button?: {
    children: string
    onClick: React.ComponentProps<'button'>['onClick']
  }
}

function Alert({ variant, message, button }: AlertProps) {
  const { containerClass, textClass, iconClass, buttonClass, Icon } = variantConfig[variant]

  return (
    <div className={clsx(containerClass, 'flex items-center gap-3 p-4 rounded-xl')} role="alert">
      <span aria-hidden="true" className={iconClass}>
        <Icon size={22} />
      </span>
      <span className={clsx(textClass, 'flex-1')}>{message}</span>
      {button && (
        <button
          className={clsx(buttonClass, 'px-4 py-2 rounded-lg font-medium flex-shrink-0 cursor-pointer')}
          type="button"
          {...button}
        />
      )}
    </div>
  )
}

export { Alert }
