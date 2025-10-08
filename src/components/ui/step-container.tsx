type StepContainerProps = {
  children: React.ReactNode
}

function StepContainer({ children }: StepContainerProps) {
  return <div className="flex flex-col gap-8">{children}</div>
}

export { StepContainer }
