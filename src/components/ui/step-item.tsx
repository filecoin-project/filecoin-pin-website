import { BadgeNumber } from './badge-number.tsx'

type StepItemProps = {
  step: number
  children: React.ReactNode
}

function StepItem({ step, children }: StepItemProps) {
  return (
    <div className="flex items-start gap-4 text-muted">
      <BadgeNumber number={step} />
      {children}
    </div>
  )
}

export { StepItem }
