import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn.ts'

export type HeadingProps = VariantProps<typeof headingVariants> & {
  tag: 'h1' | 'h2' | 'h3' | 'h4'
  children: string | React.ReactNode
}

const headingVariants = cva('text-balance', {
  variants: {
    tag: {
      h1: 'font-medium text-3xl leading-tight tracking-tight',
      h2: 'text-xl font-medium leading-tight tracking-tight',
      h3: 'text-lg font-medium leading-tight tracking-tight',
      h4: 'text-base font-medium leading-tight tracking-tight',
    },
  },
  defaultVariants: {
    tag: 'h1',
  },
})

export function Heading({ tag, children }: HeadingProps) {
  const Tag = tag

  return <Tag className={cn(headingVariants({ tag }))}>{children}</Tag>
}
