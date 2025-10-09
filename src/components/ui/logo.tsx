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
    <span className="uppercase px-2 py-0.5 rounded-sm text-[var(--color-brand-50)] border bg-[var(--color-brand-200)] text-sm font-mono border-[var(--color-brand-100)]">
      Demo
    </span>
  )
}

export { Logo }
