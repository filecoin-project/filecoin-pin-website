function Logo() {
  return (
    <div className="flex gap-4 items-center">
      <img alt="Filecoin Pin Logo" className="h-8 w-auto" src="/logo.svg" />
      <DemoBadge />
    </div>
  )
}

function DemoBadge() {
  return (
    <span className="uppercase px-2 py-0.5 rounded-sm text-brand-500 border bg-brand-950 text-xs font-mono border-brand-900">
      Demo
    </span>
  )
}

export { Logo }
