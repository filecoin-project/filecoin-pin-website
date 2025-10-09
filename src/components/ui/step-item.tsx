import { BadgeNumber } from '../ui/badge-number'

type StepItemProps = {
  step: number
  children: React.ReactNode
}

function StepItem({ step, children }: StepItemProps) {
  return (
    <div className="flex items-start gap-4 text-zinc-400">
      <BadgeNumber number={step} />
      {children}
    </div>
  )
}

export { StepItem }
