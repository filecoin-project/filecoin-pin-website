type IconLinkContainerProps = {
  children: React.ReactNode
}

function IconLinkContainer({ children }: IconLinkContainerProps) {
  return <div className="flex flex-col gap-6">{children}</div>
}

export { IconLinkContainer }
