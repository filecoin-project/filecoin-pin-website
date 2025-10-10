function Logo() {
  return (
    <div className="flex items-center gap-4">
      <span className="text-xl font-medium text-white">Filecoin Pin | IPFS</span>
      <DemoBadge />
    </div>
  )
}

function DemoBadge() {
  return (
    <span className="uppercase px-2 py-0.5 rounded-sm text-brand-500 border bg-brand-950 text-sm font-mono border-brand-900">
      Demo
    </span>
  )
}

export { Logo }
