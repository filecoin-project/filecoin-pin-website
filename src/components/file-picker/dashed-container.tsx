import { clsx } from 'clsx'
import { type ComponentPropsWithRef } from 'react'

export type DashedContainerProps = ComponentPropsWithRef<'div'>

export function DashedContainer({ className, ...rest }: DashedContainerProps) {
  return (
    <div
      {...rest}
      className={clsx(
        className,
        'flex h-full w-full items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950'
      )}
    />
  )
}
