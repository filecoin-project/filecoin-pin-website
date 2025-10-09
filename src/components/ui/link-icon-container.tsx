type LinkIconContainerProps = {
  children: React.ReactNode
}

function LinkIconContainer({ children }: LinkIconContainerProps) {
  return <div className="flex flex-col gap-6">{children}</div>
}

export { LinkIconContainer }
