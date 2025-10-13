'use client'

import { toast as sonnerToast } from 'sonner'
import { Alert, type AlertVariant } from '@/components/ui/alert.tsx'

type ToastProps = {
  type: AlertVariant
  message: string
  button?: {
    label: string
    onClick?: () => void
  }
}
function toaster({ type, message, button }: ToastProps) {
  return sonnerToast.custom((id) => (
    <div className="bg-black xl:w-[40vw] md:w-[60vw] w-[100vw] rounded-xl mb-4 mx-4 -mt-3 max-w-4xl">
      <Alert
        button={{
          children: button?.label || 'Close',
          onClick: () => {
            button?.onClick?.()
            sonnerToast.dismiss(id)
          },
        }}
        message={message}
        variant={type}
      />
    </div>
  ))
}

type Toast = Record<AlertVariant, (message: string, button?: ToastProps['button']) => void>

export const toast: Toast = {
  success: (message: string, button?: ToastProps['button']) => toaster({ type: 'success', message, button }),
  error: (message: string, button?: ToastProps['button']) => toaster({ type: 'error', message, button }),
  warning: (message: string, button?: ToastProps['button']) => toaster({ type: 'warning', message, button }),
  neutral: (message: string, button?: ToastProps['button']) => toaster({ type: 'neutral', message, button }),
  info: (message: string, button?: ToastProps['button']) => toaster({ type: 'info', message, button }),
}
