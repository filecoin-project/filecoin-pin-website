type StepItemContainerProps = {
  children: React.ReactNode
}

function StepItemContainer({ children }: StepItemContainerProps) {
  return <div className="flex flex-col gap-8">{children}</div>
}

export { StepItemContainer }
