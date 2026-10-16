function Logo() {
  return (
    <div className="flex gap-4 items-center">
      <img alt="Filecoin Logo" className="h-8 w-8" src="/filecoin-mark.svg" />
      <DemoBadge />
    </div>
  )
}

function DemoBadge() {
  return (
    <span className="uppercase px-2 py-0.5 rounded-sm text-badge-completed-text border bg-badge-completed text-xs font-mono border-badge-completed-border">
      Demo
    </span>
  )
}

export { Logo }
